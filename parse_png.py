import struct
import zlib
import sys

def parse_png(filename):
    with open(filename, 'rb') as f:
        signature = f.read(8)
        if signature != b'\x89PNG\r\n\x1a\n':
            return
        
        while True:
            chunk_length_bytes = f.read(4)
            if len(chunk_length_bytes) == 0:
                break
            length = struct.unpack('>I', chunk_length_bytes)[0]
            chunk_type = f.read(4)
            chunk_data = f.read(length)
            f.read(4) # crc
            
            if chunk_type == b'IHDR':
                w, h, depth, ctype, _, _, _ = struct.unpack('>IIBBBBB', chunk_data)
                print(f"Size: {w}x{h}, Depth: {depth}, ColorType: {ctype}")
            elif chunk_type == b'IDAT':
                # Simplified: we only need to know if there's black and white pixels.
                # Actually decompression requires combining all IDATs, but let's just use a library if possible, or wait, python's standard library `tkinter.PhotoImage` can read PNGs!
                pass

if __name__ == '__main__':
    parse_png('public/ghost_texture.png')
