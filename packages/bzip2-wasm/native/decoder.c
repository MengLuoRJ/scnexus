#include <bzlib.h>
#include <stdlib.h>
#include <string.h>

void emscripten_notify_memory_growth(int memory_index) { (void)memory_index; }
void bz_internal_error(int code) { (void)code; __builtin_trap(); }

typedef struct {
    bz_stream stream;
    int compress;
    unsigned int consumed;
    unsigned int produced;
} bzip2_handle;

bzip2_handle *bzip2_create(int compress, int block_size) {
    bzip2_handle *handle = calloc(1, sizeof(*handle));
    if (!handle) return NULL;
    handle->compress = compress;
    int status = compress
        ? BZ2_bzCompressInit(&handle->stream, block_size, 0, 30)
        : BZ2_bzDecompressInit(&handle->stream, 0, 0);
    if (status != BZ_OK) { free(handle); return NULL; }
    return handle;
}

int bzip2_step(bzip2_handle *handle, char *input, unsigned int input_size,
               char *output, unsigned int output_size, int finish) {
    handle->stream.next_in = input;
    handle->stream.avail_in = input_size;
    handle->stream.next_out = output;
    handle->stream.avail_out = output_size;
    int status = handle->compress
        ? BZ2_bzCompress(&handle->stream, finish ? BZ_FINISH : BZ_RUN)
        : BZ2_bzDecompress(&handle->stream);
    handle->consumed = input_size - handle->stream.avail_in;
    handle->produced = output_size - handle->stream.avail_out;
    return status;
}

unsigned int bzip2_consumed(bzip2_handle *handle) { return handle->consumed; }
unsigned int bzip2_produced(bzip2_handle *handle) { return handle->produced; }
void bzip2_destroy(bzip2_handle *handle) {
    if (!handle) return;
    if (handle->compress) BZ2_bzCompressEnd(&handle->stream);
    else BZ2_bzDecompressEnd(&handle->stream);
    free(handle);
}
