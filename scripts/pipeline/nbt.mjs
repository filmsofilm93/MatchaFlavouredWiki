// Minimal reader for Minecraft's binary NBT (structure .nbt files are
// gzip-compressed, big-endian). Longs become Numbers (precision is not needed
// for anything the wiki reads).
import zlib from "node:zlib";

export function readNbt(buffer) {
  const data = buffer[0] === 0x1f && buffer[1] === 0x8b ? zlib.gunzipSync(buffer) : buffer;
  let offset = 0;
  const u8 = () => data.readUInt8(offset++);
  const i16 = () => { const v = data.readInt16BE(offset); offset += 2; return v; };
  const u16 = () => { const v = data.readUInt16BE(offset); offset += 2; return v; };
  const i32 = () => { const v = data.readInt32BE(offset); offset += 4; return v; };
  const i64 = () => { const v = data.readBigInt64BE(offset); offset += 8; return Number(v); };
  const f32 = () => { const v = data.readFloatBE(offset); offset += 4; return v; };
  const f64 = () => { const v = data.readDoubleBE(offset); offset += 8; return v; };
  const str = () => { const length = u16(); const v = data.toString("utf8", offset, offset + length); offset += length; return v; };

  const payload = (type) => {
    switch (type) {
      case 1: return data.readInt8(offset++);
      case 2: return i16();
      case 3: return i32();
      case 4: return i64();
      case 5: return f32();
      case 6: return f64();
      case 7: { const length = i32(); const v = [...data.subarray(offset, offset + length)].map((b) => (b << 24) >> 24); offset += length; return v; }
      case 8: return str();
      case 9: { const inner = u8(); const length = i32(); const list = []; for (let i = 0; i < length; i += 1) list.push(payload(inner)); return list; }
      case 10: {
        const compound = {};
        for (;;) {
          const inner = u8();
          if (inner === 0) return compound;
          const name = str();
          compound[name] = payload(inner);
        }
      }
      case 11: { const length = i32(); const list = []; for (let i = 0; i < length; i += 1) list.push(i32()); return list; }
      case 12: { const length = i32(); const list = []; for (let i = 0; i < length; i += 1) list.push(i64()); return list; }
      default: throw new Error(`Unknown NBT tag type ${type} at ${offset}`);
    }
  };

  const rootType = u8();
  if (rootType !== 10) throw new Error("NBT root is not a compound.");
  str(); // root name
  return payload(10);
}
