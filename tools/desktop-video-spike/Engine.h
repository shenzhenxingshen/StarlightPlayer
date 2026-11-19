#pragma once
#include <stddef.h>
#include <stdint.h>

typedef struct VideoEngine VideoEngine;
typedef struct {
    int id, error, reason;
    uint64_t request;
    char message[768];
} VideoEvent;

// Control API belongs to the AppKit/main thread; rendering owns a separate thread.
VideoEngine *video_create(int mute, char *error, size_t capacity);
void video_destroy(VideoEngine *engine);
int video_command(VideoEngine *engine, uint64_t request, const char *a, const char *b, const char *c);
double video_number(VideoEngine *engine, const char *property);
int video_flag(VideoEngine *engine, const char *property);
VideoEvent video_poll(VideoEngine *engine);
uint64_t video_copy_frame(VideoEngine *engine, void *pixels, size_t size, uint64_t previous);
const char *video_error(int code);
const char *video_version(VideoEngine *engine);
int video_render_error(VideoEngine *engine);
