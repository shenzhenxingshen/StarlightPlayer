#include <stddef.h>
#include <stdint.h>

typedef struct {
    double host_seconds;
    double start_seconds;
    double duration_seconds;
    double rms;
    double sample_rate;
    int64_t frames;
    int32_t status;
    uint32_t flags;
} VPAudioRecord;

/* Returned tap owns +1 CF reference; Swift consumes it with takeRetainedValue. */
void *VPCreateAudioTap(void);
size_t VPDrainAudioTap(void *tap, VPAudioRecord *records, size_t capacity);
uint64_t VPAudioTapDropped(void *tap);
