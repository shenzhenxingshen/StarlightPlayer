#define _POSIX_C_SOURCE 200809L

#include <mpv/client.h>

#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static uint64_t monotonic_ns(void)
{
    struct timespec value;
    clock_gettime(CLOCK_MONOTONIC, &value);
    return (uint64_t)value.tv_sec * 1000000000ULL + (uint64_t)value.tv_nsec;
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

static double get_double_property(mpv_handle *mpv, const char *name)
{
    double value = NAN;
    if (mpv_get_property(mpv, name, MPV_FORMAT_DOUBLE, &value) < 0) {
        return NAN;
    }
    return value;
}

static void require_mpv(int status, const char *operation)
{
    if (status < 0) {
        fprintf(stderr, "%s failed: %s\n", operation, mpv_error_string(status));
        exit(1);
    }
}

static void set_option(mpv_handle *mpv, const char *name, const char *value)
{
    require_mpv(mpv_set_option_string(mpv, name, value), name);
}

int main(int argc, char **argv)
{
    if (argc != 5) {
        fprintf(stderr, "usage: %s audio.wav events.csv cycles mute\n", argv[0]);
        return 2;
    }

    const int target_cycles = parse_positive_int(argv[3], "cycles");
    if (strcmp(argv[4], "0") != 0 && strcmp(argv[4], "1") != 0) {
        fprintf(stderr, "invalid mute: %s\n", argv[4]);
        return 2;
    }
    const int mute = strcmp(argv[4], "1") == 0;
    double duration_ms = NAN;
    FILE *csv = fopen(argv[2], "w");
    if (csv == NULL) {
        perror("cannot create csv");
        return 1;
    }
    fprintf(csv,
            "engine,event,cycle,elapsed_ms,expected_ms,drift_ms,output_frame,cycle_frames,transition_gap_ms,playlist_entry_id,reason,error,playback_time_s,audio_pts_s\n");

    mpv_handle *mpv = mpv_create();
    if (mpv == NULL) {
        fprintf(stderr, "mpv_create failed\n");
        fclose(csv);
        return 1;
    }

    set_option(mpv, "vid", "no");
    set_option(mpv, "audio-display", "no");
    set_option(mpv, "audio-file-auto", "no");
    set_option(mpv, "load-scripts", "no");
    set_option(mpv, "input-default-bindings", "no");
    set_option(mpv, "gapless-audio", "yes");
    set_option(mpv, "audio-samplerate", "44100");
    set_option(mpv, "audio-format", "s16");
    set_option(mpv, "audio-channels", "stereo");
    set_option(mpv, "pause", "yes");
    set_option(mpv, "volume", mute ? "0" : "100");
    require_mpv(mpv_initialize(mpv), "mpv_initialize");

    const char *load[] = {"loadfile", argv[1], "replace", NULL};
    require_mpv(mpv_command(mpv, load), "load first file");
    for (int i = 1; i < target_cycles; ++i) {
        const char *append[] = {"loadfile", argv[1], "append-play", NULL};
        require_mpv(mpv_command(mpv, append), "append file");
    }
    require_mpv(mpv_set_property_string(mpv, "pause", "no"), "unpause");

    printf("libmpv=%lu.%lu cycles=%d gapless=yes sample_rate=44100 format=s16 channels=stereo\n",
           (unsigned long)(mpv_client_api_version() >> 16),
           (unsigned long)(mpv_client_api_version() & 0xffff),
           target_cycles);

    uint64_t origin_ns = 0;
    uint64_t previous_end_ns = 0;
    int started = 0;
    int ended = 0;
    int failed = 0;

    while (ended < target_cycles) {
        mpv_event *event = mpv_wait_event(mpv, 1.0);
        const uint64_t now = monotonic_ns();

        if (event->event_id == MPV_EVENT_NONE) {
            continue;
        }
        if (event->event_id == MPV_EVENT_SHUTDOWN) {
            fprintf(stderr, "mpv shut down before all cycles completed\n");
            failed = 1;
            break;
        }

        const char *event_name = NULL;
        int cycle = 0;
        const char *reason = "";
        int error = event->error;
        int64_t playlist_entry_id = -1;

        if (event->event_id == MPV_EVENT_START_FILE) {
            mpv_event_start_file *start = (mpv_event_start_file *)event->data;
            started += 1;
            cycle = started;
            event_name = "cycle_start";
            playlist_entry_id = start == NULL ? -1 : start->playlist_entry_id;
            if (origin_ns == 0) {
                origin_ns = now;
            }
        } else if (event->event_id == MPV_EVENT_FILE_LOADED) {
            cycle = started;
            event_name = "file_loaded";
            const double duration_seconds = get_double_property(mpv, "duration");
            if (isfinite(duration_seconds) && duration_seconds > 0) {
                duration_ms = duration_seconds * 1000.0;
            }
        } else if (event->event_id == MPV_EVENT_END_FILE) {
            mpv_event_end_file *end = (mpv_event_end_file *)event->data;
            ended += 1;
            cycle = ended;
            event_name = "cycle_end";
            previous_end_ns = now;
            if (end != NULL) {
                playlist_entry_id = end->playlist_entry_id;
                error = end->error;
                switch (end->reason) {
                    case MPV_END_FILE_REASON_EOF:
                        reason = "eof";
                        break;
                    case MPV_END_FILE_REASON_STOP:
                        reason = "stop";
                        break;
                    case MPV_END_FILE_REASON_QUIT:
                        reason = "quit";
                        break;
                    case MPV_END_FILE_REASON_ERROR:
                        reason = "error";
                        failed = 1;
                        break;
                    case MPV_END_FILE_REASON_REDIRECT:
                        reason = "redirect";
                        break;
                    default:
                        reason = "unknown";
                        break;
                }
            }
        }

        if (event_name != NULL && origin_ns != 0) {
            const double elapsed_ms = (double)(now - origin_ns) / 1000000.0;
            const double expected_ms = !isfinite(duration_ms)
                                           ? 0.0
                                           : strcmp(event_name, "cycle_end") == 0
                                                 ? duration_ms * (double)cycle
                                                 : duration_ms * (double)(cycle - 1);
            const double transition_gap_ms =
                strcmp(event_name, "cycle_start") == 0 && previous_end_ns != 0
                    ? (double)(now - previous_end_ns) / 1000000.0
                    : NAN;
            const double playback_time = get_double_property(mpv, "playback-time");
            const double audio_pts = get_double_property(mpv, "audio-pts");

            fprintf(csv,
                    "libmpv,%s,%d,%.3f,%.3f,%.3f,,0,%.3f,%lld,%s,%d,%.6f,%.6f\n",
                    event_name,
                    cycle,
                    elapsed_ms,
                    expected_ms,
                    elapsed_ms - expected_ms,
                    transition_gap_ms,
                    (long long)playlist_entry_id,
                    reason,
                    error,
                    playback_time,
                    audio_pts);
            fflush(csv);
        }
    }

    fclose(csv);
    mpv_terminate_destroy(mpv);
    return failed ? 1 : 0;
}

