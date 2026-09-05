/*
 * tt_render.h — publish frames to the Tensor Trainer "Render" panel.
 *
 * Include this from any C / C++ / CUDA program running in the workspace:
 *
 *     #include "/workspace/tt_render.h"
 *     tt_render_frame(rgba, width, height);   // rgba is width*height*4 bytes
 *
 * Call it once for a still image, or in a loop for animation. Frames are written
 * to /tmp/render/frame.bin; a streamer inside the container forwards each new
 * frame over a WebSocket to the browser, which uploads it as a GPU texture.
 *
 * Writes go to a temp file and are then rename()d into place, so the reader never
 * observes a half-written frame. Producing frames faster than the panel consumes
 * them is fine and expected — the streamer always ships the most recent one.
 *
 * Row 0 is the TOP of the image. Channel order is R, G, B, A.
 */
#ifndef TT_RENDER_H
#define TT_RENDER_H

#include <stdio.h>
#include <stdlib.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#endif

#define TT_RENDER_DIR   "/tmp/render"
#define TT_RENDER_PATH  TT_RENDER_DIR "/frame.bin"
#define TT_RENDER_TMP   TT_RENDER_DIR "/.frame.tmp"

/* Bytes 'T','T','F','1' read back as a little-endian uint32. */
#define TT_RENDER_MAGIC 0x31465454u

static unsigned int tt__render_seq = 0u;

/*
 * Publishes one RGBA frame. Returns 0 on success, non-zero on failure.
 * Safe to call at any rate; the panel displays the latest frame available.
 */
static int tt_render_frame(const unsigned char *rgba, int width, int height)
{
    if (rgba == NULL || width <= 0 || height <= 0) {
        fprintf(stderr, "[tt_render] invalid frame (%dx%d)\n", width, height);
        return 1;
    }

    FILE *f = fopen(TT_RENDER_TMP, "wb");
    if (f == NULL) {
        fprintf(stderr, "[tt_render] cannot open %s — does %s exist?\n",
                TT_RENDER_TMP, TT_RENDER_DIR);
        return 1;
    }

    unsigned int header[4];
    header[0] = TT_RENDER_MAGIC;
    header[1] = ++tt__render_seq;
    header[2] = (unsigned int)width;
    header[3] = (unsigned int)height;

    size_t pixels = (size_t)width * (size_t)height * 4u;
    int ok = (fwrite(header, sizeof(header), 1, f) == 1) &&
             (fwrite(rgba, 1, pixels, f) == pixels);
    fclose(f);

    if (!ok) {
        fprintf(stderr, "[tt_render] short write\n");
        remove(TT_RENDER_TMP);
        return 1;
    }

    /* Atomic within the directory: readers see either the old frame or the new one. */
    if (rename(TT_RENDER_TMP, TT_RENDER_PATH) != 0) {
        fprintf(stderr, "[tt_render] rename failed\n");
        return 1;
    }
    return 0;
}

/* Pace an animation loop. */
static void tt_sleep_ms(int ms)
{
    if (ms <= 0) return;
#ifdef _WIN32
    Sleep((DWORD)ms);
#else
    usleep((useconds_t)ms * 1000);
#endif
}

#endif /* TT_RENDER_H */
