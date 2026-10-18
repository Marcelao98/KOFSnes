//! Núcleo SNES em Rust pro KOFnes no celular (compila pra WebAssembly).
//! O núcleo em Kof (`snes/`) é o gabarito: cada peça nova só entra quando dá o mesmo resultado dele.
//!
//! Etapa 0 (este teste): só a CPU 65816 + um barramento mínimo (LoROM + WRAM), pra medir o ganho de
//! velocidade contra a CPU do Kof antes de portar o resto.

pub mod cpu;
use cpu::{Bus, Cpu};

/// Barramento de teste, idêntico ao do `testes/nucleo-rust/comparar.cjs` (lado Kof).
/// LoROM (bancos $00-$7D / $80-$FF, endereços $8000+), 128 KB de WRAM (e o espelho $0000-$1FFF),
/// e dois registradores fingidos ($4210/$4212) que alternam o bit de vblank conforme os ciclos.
pub struct BusTeste {
    pub rom: Vec<u8>,
    pub wram: Vec<u8>,
    pub ciclos: u64,
}

impl BusTeste {
    pub fn novo(rom: Vec<u8>) -> Self {
        BusTeste { rom, wram: vec![0; 0x20000], ciclos: 0 }
    }
}

impl Bus for BusTeste {
    #[inline(always)]
    fn read(&mut self, addr: i32) -> i32 {
        self.ciclos += 8;
        let bank = (addr >> 16) & 0xFF;
        let off = addr & 0xFFFF;
        let b7 = bank & 0x7F;
        if b7 < 0x7E && off >= 0x8000 {
            let i = (b7 as usize) * 0x8000 + (off as usize - 0x8000);
            return self.rom[i % self.rom.len()] as i32;
        }
        if bank == 0x7E || bank == 0x7F {
            return self.wram[(bank as usize - 0x7E) * 0x10000 + off as usize] as i32;
        }
        if b7 < 0x40 {
            if off < 0x2000 {
                return self.wram[off as usize] as i32;
            }
            if off == 0x4210 || off == 0x4212 {
                return (((self.ciclos / 40000) & 1) as i32) << 7;
            }
        }
        0
    }

    #[inline(always)]
    fn write(&mut self, addr: i32, v: i32) {
        self.ciclos += 8;
        let bank = (addr >> 16) & 0xFF;
        let off = addr & 0xFFFF;
        if bank == 0x7E || bank == 0x7F {
            self.wram[(bank as usize - 0x7E) * 0x10000 + off as usize] = v as u8;
        } else if (bank & 0x7F) < 0x40 && off < 0x2000 {
            self.wram[off as usize] = v as u8;
        }
    }

    #[inline(always)]
    fn idle(&mut self) {
        self.ciclos += 6;
    }
}

// ---------------- interface pro JavaScript (sem wasm-bindgen: só funções C) ----------------
#[allow(static_mut_refs)]
mod ffi {
    use super::*;
    static mut CPU: Option<Cpu<BusTeste>> = None;

    #[no_mangle]
    pub extern "C" fn kof_alloc(len: usize) -> *mut u8 {
        let mut v = vec![0u8; len];
        let p = v.as_mut_ptr();
        std::mem::forget(v);
        p
    }

    #[no_mangle]
    pub unsafe extern "C" fn spike_load(ptr: *const u8, len: usize) {
        let rom = std::slice::from_raw_parts(ptr, len).to_vec();
        let mut cpu = Cpu::new(BusTeste::novo(rom));
        cpu.reset();
        CPU = Some(cpu);
    }

    #[no_mangle]
    pub unsafe extern "C" fn spike_run(n: u32) {
        let cpu = CPU.as_mut().unwrap();
        for _ in 0..n {
            cpu.step();
        }
    }

    #[no_mangle]
    pub unsafe extern "C" fn spike_reg(i: i32) -> i32 {
        let c = CPU.as_ref().unwrap();
        match i {
            0 => c.a, 1 => c.x, 2 => c.y, 3 => c.s, 4 => c.d, 5 => c.dbr, 6 => c.pbr, 7 => c.pc,
            8 => c.get_p(), 9 => c.e as i32, 10 => c.waiting as i32, 11 => c.stopped as i32,
            _ => 0,
        }
    }

    #[no_mangle]
    pub unsafe extern "C" fn spike_wram_ptr() -> *const u8 {
        CPU.as_ref().unwrap().bus.wram.as_ptr()
    }

    #[no_mangle]
    pub unsafe extern "C" fn spike_ciclos() -> f64 {
        CPU.as_ref().unwrap().bus.ciclos as f64
    }
}
