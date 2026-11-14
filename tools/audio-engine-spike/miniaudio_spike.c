#define _POSIX_C_SOURCE 200809L

#include <miniaudio.h>

#include <stdatomic.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef struct spike_context {
    ma_decoder decoder;
    FILE *csv;
    ma_uint64 cycle_frames;
    ma_uint64 output_frames;
    ma_uint32 channels;
    int target_cycles;
    int current_cycle;
    uint64_t origin_ns;
    atomic_bool done;
    atomic_bool failed;
} spike_context;

static uint64_t monotonic_ns(void)
{
    struct timespec value;
    clock_gettime(CLOCK_MONOTONIC, &value);
    return (uint64_t)value.tv_sec * 1000000000ULL + (uint64_t)value.tv_nsec;
}

static void log_event(spike_context *context, const char *event, int cycle)
{
    const uint64_t now = monotonic_ns();
    if (context->origin_ns == 0) {
        context->origin_ns = now;
    }
    const double elapsed_ms = (double)(now - context->origin_ns) / 1000000.0;
    const double duration_ms = (double)context->cycle_frames * 1000.0 /
                               (double)context->decoder.outputSampleRate;
    const double expected_ms = strcmp(event, "cycle_end") == 0
                                   ? duration_ms * (double)cycle
                                   : duration_ms * (double)(cycle - 1);

    fprintf(context->csv,
            "miniaudio,%s,%d,%.3f,%.3f,%.3f,%llu,%llu,0,,,,,\n",
            event,
            cycle,
            elapsed_ms,
            expected_ms,
            elapsed_ms - expected_ms,
            (unsigned long long)context->output_frames,
            (unsigned long long)context->cycle_frames);
    fflush(context->csv);
}

static void data_callback(ma_device *device, void *output, const void *input, ma_uint32 frame_count)
{
    (void)input;
    spike_context *context = (spike_context *)device->pUserData;
    const ma_uint32 bytes_per_frame = ma_get_bytes_per_frame(
        context->decoder.outputFormat, context->channels);
    ma_uint32 produced = 0;

    if (context->origin_ns == 0) {
        log_event(context, "cycle_start", 1);
    }

    while (produced < frame_count && !atomic_load(&context->done)) {
        ma_uint64 frames_read = 0;
        ma_result result = ma_decoder_read_pcm_frames(
            &context->decoder,
            (ma_uint8 *)output + (size_t)produced * bytes_per_frame,
            frame_count - produced,
            &frames_read);

        produced += (ma_uint32)frames_read;
        context->output_frames += frames_read;

        if (result != MA_SUCCESS && result != MA_AT_END) {
            fprintf(stderr, "miniaudio read failed: %s\n", ma_result_description(result));
            atomic_store(&context->failed, true);
            atomic_store(&context->done, true);
            break;
        }

        if (result == MA_AT_END || frames_read == 0) {
            log_event(context, "cycle_end", context->current_cycle);
            if (context->current_cycle >= context->target_cycles) {
                atomic_store(&context->done, true);
                break;
            }

            result = ma_decoder_seek_to_pcm_frame(&context->decoder, 0);
            if (result != MA_SUCCESS) {
                fprintf(stderr, "miniaudio seek failed: %s\n", ma_result_description(result));
                atomic_store(&context->failed, true);
                atomic_store(&context->done, true);
                break;
            }
            context->current_cycle += 1;
            log_event(context, "cycle_start", context->current_cycle);
        }
    }

    if (produced < frame_count) {
        memset((ma_uint8 *)output + (size_t)produced * bytes_per_frame,
               0,
               (size_t)(frame_count - produced) * bytes_per_frame);
    }
}

static int parse_positive_int(const char *value, const char *name)
{
    char *end = NULL;
    const long parsed = strtol(value, &end, 10);
    if (value[0] == '\0' || end == NULL || *end != '\0' || parsed <= 0 || parsed > 1000000) {
        fprintf(stderr, "invalid %s: %s\n", name, value);
        exit(2);
    }
    return (int)parsed;
}

static void sleep_ms(long milliseconds)
{
    struct timespec value;
    value.tv_sec = milliseconds / 1000;
    value.tv_nsec = (milliseconds % 1000) * 1000000L;
    while (nanosleep(&value, &value) != 0) {
    }
}

int main(int argc, char **argv)
{
    if (argc != 5) {
        fprintf(stderr, "usage: %s audio.wav events.csv cycles mute\n", argv[0]);
        return 2;
    }

    spike_context context;
    memset(&context, 0, sizeof(context));
    context.target_cycles = parse_positive_int(argv[3], "cycles");
    context.current_cycle = 1;
    atomic_init(&context.done, false);
    atomic_init(&context.failed, false);

    ma_decoder_config decoder_config = ma_decoder_config_init_default();
    ma_result result = ma_decoder_init_file(argv[1], &decoder_config, &context.decoder);
    if (result != MA_SUCCESS) {
        fprintf(stderr, "cannot open audio: %s\n", ma_result_description(result));
        return 1;
    }

    result = ma_decoder_get_length_in_pcm_frames(&context.decoder, &context.cycle_frames);
    if (result != MA_SUCCESS || context.cycle_frames == 0) {
        fprintf(stderr, "cannot determine audio length: %s\n", ma_result_description(result));
        ma_decoder_uninit(&context.decoder);
        return 1;
    }
    context.channels = context.decoder.outputChannels;
    context.csv = fopen(argv[2], "w");
    if (context.csv == NULL) {
        perror("cannot create csv");
        ma_decoder_uninit(&context.decoder);
        return 1;
    }
    fprintf(context.csv,
            "engine,event,cycle,elapsed_ms,expected_ms,drift_ms,output_frame,cycle_frames,transition_gap_ms,playlist_entry_id,reason,error,playback_time_s,audio_pts_s\n");

    ma_device_config device_config = ma_device_config_init(ma_device_type_playback);
    device_config.playback.format = context.decoder.outputFormat;
    device_config.playback.channels = context.decoder.outputChannels;
    device_config.sampleRate = context.decoder.outputSampleRate;
    device_config.periodSizeInMilliseconds = 10;
    device_config.dataCallback = data_callback;
    device_config.pUserData = &context;

    ma_device device;
    result = ma_device_init(NULL, &device_config, &device);
    if (result != MA_SUCCESS) {
        fprintf(stderr, "cannot initialize output device: %s\n", ma_result_description(result));
        fclose(context.csv);
        ma_decoder_uninit(&context.decoder);
        return 1;
    }

    if (strcmp(argv[4], "0") != 0 && strcmp(argv[4], "1") != 0) {
        fprintf(stderr, "invalid mute: %s\n", argv[4]);
        ma_device_uninit(&device);
        fclose(context.csv);
        ma_decoder_uninit(&context.decoder);
        return 2;
    }
    if (strcmp(argv[4], "1") == 0) {
        ma_device_set_master_volume(&device, 0.0f);
    }

    printf("miniaudio=%s sample_rate=%u channels=%u cycle_frames=%llu cycles=%d\n",
           MA_VERSION_STRING,
           context.decoder.outputSampleRate,
           context.decoder.outputChannels,
           (unsigned long long)context.cycle_frames,
           context.target_cycles);

    result = ma_device_start(&device);
    if (result != MA_SUCCESS) {
        fprintf(stderr, "cannot start output device: %s\n", ma_result_description(result));
        ma_device_uninit(&device);
        fclose(context.csv);
        ma_decoder_uninit(&context.decoder);
        return 1;
    }

    while (!atomic_load(&context.done)) {
        sleep_ms(20);
    }
    sleep_ms(250);

    ma_device_uninit(&device);
    fclose(context.csv);
    ma_decoder_uninit(&context.decoder);

    return atomic_load(&context.failed) ? 1 : 0;
}

