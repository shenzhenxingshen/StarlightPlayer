#include "Engine.h"
#include <mpv/client.h>
#include <mpv/render.h>
#include <math.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// A bounded 480p software surface, not the intended production GPU renderer.
#define WIDTH 864
#define HEIGHT 486
#define BYTES ((size_t)WIDTH * HEIGHT * 4)

struct VideoEngine {
    mpv_handle *mpv;
    mpv_render_context *render;
    pthread_t thread;
    pthread_mutex_t mutex;
    pthread_cond_t condition;
    int running, changed, initialized, initialization_error, render_error;
    unsigned char *latest;
    uint64_t frames;
    char version[128];
};

static void changed(void *opaque) {
    VideoEngine *e = opaque;
    pthread_mutex_lock(&e->mutex);
    e->changed = 1;
    pthread_cond_signal(&e->condition);
    pthread_mutex_unlock(&e->mutex);
}

static void *render_loop(void *opaque) {
    VideoEngine *e = opaque;
    void *surface = NULL;
    int result = posix_memalign(&surface, 64, BYTES) == 0 ? 0 : MPV_ERROR_NOMEM;
    mpv_render_param init[] = {
        {MPV_RENDER_PARAM_API_TYPE, MPV_RENDER_API_TYPE_SW}, {0, NULL}
    };
    if (!result) result = mpv_render_context_create(&e->render, e->mpv, init);
    if (!result) mpv_render_context_set_update_callback(e->render, changed, e);
    pthread_mutex_lock(&e->mutex);
    e->initialization_error = result;
    e->initialized = 1;
    pthread_cond_signal(&e->condition);
    while (result == 0 && e->running) {
        while (!e->changed && e->running) pthread_cond_wait(&e->condition, &e->mutex);
        if (!e->running) break;
        e->changed = 0;
        pthread_mutex_unlock(&e->mutex);
        // No normal client API calls or waiting for UI on the renderer thread.
        uint64_t flags = mpv_render_context_update(e->render);
        if (flags & MPV_RENDER_UPDATE_FRAME) {
            int size[] = {WIDTH, HEIGHT};
            size_t stride = WIDTH * 4;
            mpv_render_param params[] = {
                {MPV_RENDER_PARAM_SW_SIZE, size},
                {MPV_RENDER_PARAM_SW_FORMAT, "rgb0"},
                {MPV_RENDER_PARAM_SW_STRIDE, &stride},
                {MPV_RENDER_PARAM_SW_POINTER, surface},
                {0, NULL}
            };
            int rendered = mpv_render_context_render(e->render, params);
            if (rendered >= 0) {
                pthread_mutex_lock(&e->mutex);
                memcpy(e->latest, surface, BYTES);
                e->frames++;
                pthread_mutex_unlock(&e->mutex);
            } else {
                pthread_mutex_lock(&e->mutex);
                e->render_error = rendered;
                pthread_mutex_unlock(&e->mutex);
            }
        }
        pthread_mutex_lock(&e->mutex);
    }
    pthread_mutex_unlock(&e->mutex);
    if (e->render) mpv_render_context_free(e->render);
    free(surface);
    return NULL;
}

VideoEngine *video_create(int mute, char *error, size_t capacity) {
    VideoEngine *e = calloc(1, sizeof(*e));
    int result = MPV_ERROR_NOMEM;
    if (!e) goto failure;
    e->mpv = mpv_create();
    e->latest = calloc(1, BYTES);
    if (!e->mpv || !e->latest) goto failure;
    const char *options[][2] = {
        {"config", "no"}, {"load-scripts", "no"}, {"terminal", "no"},
        {"input-default-bindings", "no"}, {"input-vo-keyboard", "no"},
        {"audio-file-auto", "no"}, {"sub-auto", "no"}, {"osc", "no"},
        {"vo", "libmpv"}, {"hwdec", "no"}, {"pause", "yes"},
        {"idle", "yes"}, {"keep-open", "yes"}, {"gapless-audio", "yes"},
        {"osd-level", "0"}, {"volume", mute ? "0" : "30"},
    };
    for (size_t i = 0; i < sizeof(options) / sizeof(options[0]); i++) {
        result = mpv_set_option_string(e->mpv, options[i][0], options[i][1]);
        if (result < 0) goto failure;
    }
    if ((result = mpv_initialize(e->mpv)) < 0) goto failure;
    mpv_request_log_messages(e->mpv, "warn");
    char *version = mpv_get_property_string(e->mpv, "mpv-version");
    snprintf(e->version, sizeof(e->version), "%s", version ? version : "unknown");
    mpv_free(version);
    if (pthread_mutex_init(&e->mutex, NULL) != 0) goto failure;
    if (pthread_cond_init(&e->condition, NULL) != 0) {
        pthread_mutex_destroy(&e->mutex);
        goto failure;
    }
    e->running = 1;
    if (pthread_create(&e->thread, NULL, render_loop, e) != 0) {
        pthread_cond_destroy(&e->condition);
        pthread_mutex_destroy(&e->mutex);
        goto failure;
    }
    pthread_mutex_lock(&e->mutex);
    while (!e->initialized) pthread_cond_wait(&e->condition, &e->mutex);
    result = e->initialization_error;
    pthread_mutex_unlock(&e->mutex);
    if (result < 0) {
        snprintf(error, capacity, "%s", mpv_error_string(result));
        video_destroy(e);
        return NULL;
    }
    return e;
failure:
    snprintf(error, capacity, "%s", mpv_error_string(result < 0 ? result : MPV_ERROR_GENERIC));
    if (e) {
        if (e->mpv) mpv_terminate_destroy(e->mpv);
        free(e->latest);
        free(e);
    }
    return NULL;
}

void video_destroy(VideoEngine *e) {
    if (!e) return;
    pthread_mutex_lock(&e->mutex);
    e->running = 0;
    pthread_cond_signal(&e->condition);
    pthread_mutex_unlock(&e->mutex);
    pthread_join(e->thread, NULL);
    mpv_terminate_destroy(e->mpv);
    pthread_cond_destroy(&e->condition);
    pthread_mutex_destroy(&e->mutex);
    free(e->latest);
    free(e);
}

int video_command(VideoEngine *e, uint64_t request, const char *a, const char *b, const char *c) {
    const char *parts[] = {a, b, c, NULL};
    return mpv_command_async(e->mpv, request, parts);
}
double video_number(VideoEngine *e, const char *property) {
    double result = NAN;
    mpv_get_property(e->mpv, property, MPV_FORMAT_DOUBLE, &result);
    return result;
}
int video_flag(VideoEngine *e, const char *property) {
    int result = 0;
    return mpv_get_property(e->mpv, property, MPV_FORMAT_FLAG, &result) < 0 ? -1 : result;
}
VideoEvent video_poll(VideoEngine *e) {
    mpv_event *raw = mpv_wait_event(e->mpv, 0);
    VideoEvent result = {.id = raw->event_id, .error = raw->error, .request = raw->reply_userdata};
    if (raw->event_id == MPV_EVENT_END_FILE && raw->data) {
        mpv_event_end_file *end = raw->data;
        result.reason = end->reason;
        result.error = end->error;
    }
    if (raw->event_id == MPV_EVENT_LOG_MESSAGE && raw->data) {
        mpv_event_log_message *log = raw->data;
        snprintf(result.message, sizeof(result.message), "%s: %s", log->prefix, log->text);
    }
    return result;
}
uint64_t video_copy_frame(VideoEngine *e, void *pixels, size_t size, uint64_t previous) {
    if (size < BYTES) return previous;
    pthread_mutex_lock(&e->mutex);
    uint64_t frames = e->frames;
    if (frames != previous) memcpy(pixels, e->latest, BYTES);
    pthread_mutex_unlock(&e->mutex);
    return frames;
}
const char *video_error(int code) { return mpv_error_string(code); }
const char *video_version(VideoEngine *e) { return e->version; }
int video_render_error(VideoEngine *e) {
    pthread_mutex_lock(&e->mutex);
    int error = e->render_error;
    e->render_error = 0;
    pthread_mutex_unlock(&e->mutex);
    return error;
}
