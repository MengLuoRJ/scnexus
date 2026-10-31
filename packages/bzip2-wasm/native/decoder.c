#include <bzlib.h>
#include <string.h>

/* JS always reads memory.buffer afresh, so no host view needs updating. */
void emscripten_notify_memory_growth(int memory_index) {
    (void)memory_index;
}

/* Required by libbz2 when compiled without stdio. */
void bz_internal_error(int code) {
    (void)code;
    __builtin_trap();
}

/* -100: wrong output size; -101: trailing bytes; otherwise libbz2 status. */
int decode_bzip2(char *input, unsigned int input_size,
                char *output, unsigned int expected_size) {
    bz_stream stream;
    memset(&stream, 0, sizeof(stream));
    int status = BZ2_bzDecompressInit(&stream, 0, 0);
    if (status != BZ_OK) return status;

    stream.next_in = input;
    stream.avail_in = input_size;
    stream.next_out = output;
    /* One extra byte distinguishes a full buffer from a complete stream. */
    stream.avail_out = expected_size + 1;
    for (;;) {
        status = BZ2_bzDecompress(&stream);
        if (status == BZ_STREAM_END) {
            if (stream.total_out_lo32 != expected_size) status = -100;
            else if (stream.avail_in != 0) status = -101;
            else status = BZ_OK;
            break;
        }
        if (status != BZ_OK) break;
        if (stream.avail_out == 0) {
            status = -100;
            break;
        }
        if (stream.avail_in == 0) {
            status = BZ_UNEXPECTED_EOF;
            break;
        }
    }
    BZ2_bzDecompressEnd(&stream);
    return status;
}
