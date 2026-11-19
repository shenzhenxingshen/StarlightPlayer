#include "AudioTap.h"
#include <MediaToolbox/MediaToolbox.h>
#include <CoreMedia/CoreMedia.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <math.h>

/* Single-producer/single-consumer, bounded, preallocated diagnostic ring.
 * No allocation, file writes, locks or Swift callbacks on the audio thread.
 * This observes decoded audio BEFORE hardware output, not speaker timestamps.
 */
#define CAPACITY 16384
typedef struct {
    VPAudioRecord records[CAPACITY];
    _Atomic uint64_t written;
    _Atomic uint64_t read;
    _Atomic uint64_t dropped;
    AudioStreamBasicDescription format;
} TapState;

static void tap_init(MTAudioProcessingTapRef tap, void *client, void **storage) {
    (void)tap;
    *storage = client;
}
static void tap_finalize(MTAudioProcessingTapRef tap) {
    free(MTAudioProcessingTapGetStorage(tap));
}
static void tap_prepare(MTAudioProcessingTapRef tap, CMItemCount max_frames,
                        const AudioStreamBasicDescription *format) {
    (void)max_frames;
    ((TapState *)MTAudioProcessingTapGetStorage(tap))->format = *format;
}
static void tap_unprepare(MTAudioProcessingTapRef tap) { (void)tap; }

static void tap_process(MTAudioProcessingTapRef tap, CMItemCount requested,
                        MTAudioProcessingTapFlags flags, AudioBufferList *buffers,
                        CMItemCount *frames, MTAudioProcessingTapFlags *flags_out) {
    (void)flags;
    TapState *state = MTAudioProcessingTapGetStorage(tap);
    CMTimeRange range = kCMTimeRangeInvalid;
    OSStatus status = MTAudioProcessingTapGetSourceAudio(tap, requested, buffers, flags_out, &range, frames);
    uint64_t write_index = atomic_load_explicit(&state->written, memory_order_relaxed);
    uint64_t read_index = atomic_load_explicit(&state->read, memory_order_acquire);
    if (write_index - read_index >= CAPACITY) {
        atomic_fetch_add_explicit(&state->dropped, 1, memory_order_relaxed);
        return;
    }
    double rms = -1.0;
    if (status == noErr && buffers->mNumberBuffers > 0 && buffers->mBuffers[0].mData) {
        AudioBuffer *buffer = &buffers->mBuffers[0];
        if ((state->format.mFormatFlags & kAudioFormatFlagIsFloat) && state->format.mBitsPerChannel == 32) {
            const float *values = buffer->mData;
            size_t samples = buffer->mDataByteSize / sizeof(float);
            double sum = 0;
            for (size_t i = 0; i < samples; ++i) sum += (double)values[i] * values[i];
            rms = samples ? sqrt(sum / samples) : 0;
        }
    }
    VPAudioRecord record = {
        .host_seconds = CMTimeGetSeconds(CMClockGetTime(CMClockGetHostTimeClock())),
        .start_seconds = CMTIME_IS_NUMERIC(range.start) ? CMTimeGetSeconds(range.start) : -1,
        .duration_seconds = CMTIME_IS_NUMERIC(range.duration) ? CMTimeGetSeconds(range.duration) : 0,
        .rms = rms,
        .sample_rate = state->format.mSampleRate,
        .frames = status == noErr ? *frames : 0,
        .status = status,
        .flags = *flags_out,
    };
    state->records[write_index % CAPACITY] = record;
    atomic_store_explicit(&state->written, write_index + 1, memory_order_release);
}

void *VPCreateAudioTap(void) {
    TapState *state = calloc(1, sizeof(TapState));
    if (!state) return NULL;
    MTAudioProcessingTapCallbacks callbacks = {
        .version = kMTAudioProcessingTapCallbacksVersion_0, .clientInfo = state,
        .init = tap_init, .finalize = tap_finalize, .prepare = tap_prepare,
        .unprepare = tap_unprepare, .process = tap_process,
    };
    MTAudioProcessingTapRef tap = NULL;
    OSStatus status = MTAudioProcessingTapCreate(kCFAllocatorDefault, &callbacks,
                                                kMTAudioProcessingTapCreationFlag_PostEffects, &tap);
    if (status != noErr) { free(state); return NULL; }
    return (void *)tap;
}

size_t VPDrainAudioTap(void *opaque, VPAudioRecord *records, size_t capacity) {
    TapState *state = MTAudioProcessingTapGetStorage((MTAudioProcessingTapRef)opaque);
    uint64_t read_index = atomic_load_explicit(&state->read, memory_order_relaxed);
    uint64_t written = atomic_load_explicit(&state->written, memory_order_acquire);
    size_t count = (size_t)(written - read_index);
    if (count > capacity) count = capacity;
    for (size_t i = 0; i < count; ++i) records[i] = state->records[(read_index + i) % CAPACITY];
    atomic_store_explicit(&state->read, read_index + count, memory_order_release);
    return count;
}

uint64_t VPAudioTapDropped(void *opaque) {
    TapState *state = MTAudioProcessingTapGetStorage((MTAudioProcessingTapRef)opaque);
    return atomic_load_explicit(&state->dropped, memory_order_relaxed);
}
