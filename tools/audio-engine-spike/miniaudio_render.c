#include <miniaudio.h>

#include <stdio.h>
#include <stdlib.h>

#define BUFFER_FRAMES 4096

static int parse_positive_int(const char *value)
{
    char *end = NULL;
    const long parsed = strtol(value, &end, 10);
    if (value[0] == '\0' || end == NULL || *end != '\0' || parsed <= 0 || parsed > 1000000) {
        fprintf(stderr, "invalid cycle count: %s\n", value);
        exit(2);
    }
    return (int)parsed;
}

int main(int argc, char **argv)
{
    if (argc != 4) {
        fprintf(stderr, "usage: %s audio.wav output.raw cycles\n", argv[0]);
        return 2;
    }

    const int cycles = parse_positive_int(argv[3]);
    ma_decoder_config config = ma_decoder_config_init(ma_format_s16, 2, 44100);
    ma_decoder decoder;
    ma_result result = ma_decoder_init_file(argv[1], &config, &decoder);
    if (result != MA_SUCCESS) {
        fprintf(stderr, "cannot open audio: %s\n", ma_result_description(result));
        return 1;
    }

    ma_uint64 expected_frames = 0;
    result = ma_decoder_get_length_in_pcm_frames(&decoder, &expected_frames);
    if (result != MA_SUCCESS || expected_frames == 0) {
        fprintf(stderr, "cannot determine audio length: %s\n", ma_result_description(result));
        ma_decoder_uninit(&decoder);
        return 1;
    }

    FILE *output = fopen(argv[2], "wb");
    if (output == NULL) {
        perror("cannot create output");
        ma_decoder_uninit(&decoder);
        return 1;
    }

    ma_int16 buffer[BUFFER_FRAMES * 2];
    ma_uint64 total_frames = 0;
    for (int cycle = 1; cycle <= cycles; ++cycle) {
        if (cycle > 1) {
            result = ma_decoder_seek_to_pcm_frame(&decoder, 0);
            if (result != MA_SUCCESS) {
                fprintf(stderr, "seek failed at cycle %d: %s\n", cycle, ma_result_description(result));
                fclose(output);
                ma_decoder_uninit(&decoder);
                return 1;
            }
        }

        ma_uint64 cycle_frames = 0;
        while (cycle_frames < expected_frames) {
            ma_uint64 frames_read = 0;
            const ma_uint64 requested =
                expected_frames - cycle_frames < BUFFER_FRAMES
                    ? expected_frames - cycle_frames
                    : BUFFER_FRAMES;
            result = ma_decoder_read_pcm_frames(&decoder, buffer, requested, &frames_read);
            if (frames_read > 0 && fwrite(buffer, sizeof(ma_int16) * 2, frames_read, output) != frames_read) {
                perror("write failed");
                fclose(output);
                ma_decoder_uninit(&decoder);
                return 1;
            }
            cycle_frames += frames_read;
            total_frames += frames_read;
            if (result != MA_SUCCESS && result != MA_AT_END) {
                fprintf(stderr, "decode failed at cycle %d: %s\n", cycle, ma_result_description(result));
                fclose(output);
                ma_decoder_uninit(&decoder);
                return 1;
            }
            if (frames_read == 0) {
                break;
            }
        }

        if (cycle_frames != expected_frames) {
            fprintf(stderr,
                    "cycle %d frame mismatch: expected %llu, got %llu\n",
                    cycle,
                    (unsigned long long)expected_frames,
                    (unsigned long long)cycle_frames);
            fclose(output);
            ma_decoder_uninit(&decoder);
            return 1;
        }
    }

    fclose(output);
    ma_decoder_uninit(&decoder);
    printf("cycles=%d cycle_frames=%llu total_frames=%llu\n",
           cycles,
           (unsigned long long)expected_frames,
           (unsigned long long)total_frames);
    return 0;
}
