//! WDC 65C816, porta de `snes/Cpu.kf` (linha a linha, mesma ordem de acessos ao barramento).
//! O Kof é o gabarito: este arquivo tem que dar exatamente os mesmos resultados dele.
//! Todos os valores são `i32`, como o `Int` do Kof.

/// O que a CPU enxerga do mundo (igual à interface `CpuBus` do Kof).
pub trait Bus {
    fn read(&mut self, addr: i32) -> i32;
    fn write(&mut self, addr: i32, v: i32);
    fn idle(&mut self);
}

pub struct Cpu<B: Bus> {
    pub bus: B,
    pub a: i32,
    pub x: i32,
    pub y: i32,
    pub s: i32,
    pub d: i32,
    pub dbr: i32,
    pub pbr: i32,
    pub pc: i32,
    pub fneg: bool,
    pub fv: bool,
    pub fm: bool,
    pub fx: bool,
    pub fd: bool,
    pub fi: bool,
    pub fz: bool,
    pub fc: bool,
    pub e: bool,
    aw: bool,
    pub nmi_pending: bool,
    pub irq_line: bool,
    pub waiting: bool,
    pub stopped: bool,
    pub last_op: i32,
}

impl<B: Bus> Cpu<B> {
    pub fn new(bus: B) -> Self {
        Cpu {
            bus, a: 0, x: 0, y: 0, s: 0x1FF, d: 0, dbr: 0, pbr: 0, pc: 0,
            fneg: false, fv: false, fm: true, fx: true, fd: false, fi: true, fz: false, fc: false, e: true,
            aw: false, nmi_pending: false, irq_line: false, waiting: false, stopped: false, last_op: 0,
        }
    }

    pub fn reset(&mut self) {
        self.e = true;
        self.fm = true;
        self.fx = true;
        self.fi = true;
        self.fd = false;
        self.x &= 0xFF;
        self.y &= 0xFF;
        self.s = 0x100 | (self.s & 0xFF);
        self.d = 0;
        self.dbr = 0;
        self.pbr = 0;
        self.waiting = false;
        self.stopped = false;
        self.nmi_pending = false;
        self.pc = self.rd(0xFFFC) | (self.rd(0xFFFD) << 8);
    }

    // ---------------- status ----------------
    pub fn get_p(&self) -> i32 {
        let mut p = 0;
        if self.fneg { p |= 0x80; }
        if self.fv { p |= 0x40; }
        if self.fm { p |= 0x20; }
        if self.fx { p |= 0x10; }
        if self.fd { p |= 0x08; }
        if self.fi { p |= 0x04; }
        if self.fz { p |= 0x02; }
        if self.fc { p |= 0x01; }
        p
    }

    pub fn set_p(&mut self, p: i32) {
        self.fneg = p & 0x80 != 0;
        self.fv = p & 0x40 != 0;
        self.fm = p & 0x20 != 0;
        self.fx = p & 0x10 != 0;
        self.fd = p & 0x08 != 0;
        self.fi = p & 0x04 != 0;
        self.fz = p & 0x02 != 0;
        self.fc = p & 0x01 != 0;
        if self.e {
            self.fm = true;
            self.fx = true;
        }
        if self.fx {
            self.x &= 0xFF;
            self.y &= 0xFF;
        }
    }

    // ---------------- memória ----------------
    #[inline(always)]
    fn rd(&mut self, addr: i32) -> i32 {
        self.bus.read(addr & 0xFFFFFF)
    }

    #[inline(always)]
    fn wr(&mut self, addr: i32, v: i32) {
        self.bus.write(addr & 0xFFFFFF, v & 0xFF);
    }

    #[inline(always)]
    fn idle(&mut self) {
        self.bus.idle();
    }

    #[inline(always)]
    fn fetch(&mut self) -> i32 {
        let v = self.bus.read((self.pbr << 16) | self.pc);
        self.pc = (self.pc + 1) & 0xFFFF;
        v
    }

    fn fetch16(&mut self) -> i32 {
        let lo = self.fetch();
        lo | (self.fetch() << 8)
    }

    fn fetch24(&mut self) -> i32 {
        let lo = self.fetch();
        let mid = self.fetch();
        lo | (mid << 8) | (self.fetch() << 16)
    }

    fn hi_addr(&self, addr: i32) -> i32 {
        if self.aw {
            (addr & 0xFF0000) | ((addr + 1) & 0xFFFF)
        } else {
            (addr + 1) & 0xFFFFFF
        }
    }

    fn read_m(&mut self, addr: i32) -> i32 {
        if self.fm {
            return self.rd(addr);
        }
        let lo = self.rd(addr);
        let h = self.hi_addr(addr);
        lo | (self.rd(h) << 8)
    }

    fn read_x(&mut self, addr: i32) -> i32 {
        if self.fx {
            return self.rd(addr);
        }
        let lo = self.rd(addr);
        let h = self.hi_addr(addr);
        lo | (self.rd(h) << 8)
    }

    fn write_m(&mut self, addr: i32, v: i32) {
        if self.fm {
            self.wr(addr, v);
        } else {
            self.wr(addr, v);
            let h = self.hi_addr(addr);
            self.wr(h, v >> 8);
        }
    }

    fn write_x(&mut self, addr: i32, v: i32) {
        if self.fx {
            self.wr(addr, v);
        } else {
            self.wr(addr, v);
            let h = self.hi_addr(addr);
            self.wr(h, v >> 8);
        }
    }

    // ---------------- pilha ----------------
    fn push8(&mut self, v: i32) {
        let s = self.s;
        self.wr(s, v);
        if self.e {
            self.s = 0x100 | ((self.s - 1) & 0xFF);
        } else {
            self.s = (self.s - 1) & 0xFFFF;
        }
    }

    fn push16(&mut self, v: i32) {
        self.push8(v >> 8);
        self.push8(v);
    }

    fn pull8(&mut self) -> i32 {
        if self.e {
            self.s = 0x100 | ((self.s + 1) & 0xFF);
        } else {
            self.s = (self.s + 1) & 0xFFFF;
        }
        let s = self.s;
        self.rd(s)
    }

    fn pull16(&mut self) -> i32 {
        let lo = self.pull8();
        lo | (self.pull8() << 8)
    }

    // versões "novas" (65816): não ficam presas na página 1 durante a instrução
    fn push_n(&mut self, v: i32) {
        let s = self.s;
        self.wr(s, v);
        self.s = (self.s - 1) & 0xFFFF;
    }

    fn pull_n(&mut self) -> i32 {
        self.s = (self.s + 1) & 0xFFFF;
        let s = self.s;
        self.rd(s)
    }

    fn fix_s(&mut self) {
        if self.e {
            self.s = 0x100 | (self.s & 0xFF);
        }
    }

    // ---------------- endereçamento ----------------
    fn dp_addr(&self, o: i32) -> i32 {
        if self.e && (self.d & 0xFF) == 0 {
            return self.d | (o & 0xFF);
        }
        (self.d + o) & 0xFFFF
    }

    fn dp_penalty(&mut self) {
        if (self.d & 0xFF) != 0 {
            self.idle();
        }
    }

    fn am_imm_m(&mut self) -> i32 {
        self.aw = true;
        let addr = (self.pbr << 16) | self.pc;
        if self.fm {
            self.pc = (self.pc + 1) & 0xFFFF;
        } else {
            self.pc = (self.pc + 2) & 0xFFFF;
        }
        addr
    }

    fn am_imm_x(&mut self) -> i32 {
        self.aw = true;
        let addr = (self.pbr << 16) | self.pc;
        if self.fx {
            self.pc = (self.pc + 1) & 0xFFFF;
        } else {
            self.pc = (self.pc + 2) & 0xFFFF;
        }
        addr
    }

    fn am_dp(&mut self) -> i32 {
        let o = self.fetch();
        self.dp_penalty();
        self.aw = true;
        self.dp_addr(o)
    }

    fn am_dp_x(&mut self) -> i32 {
        let o = self.fetch();
        self.dp_penalty();
        self.idle();
        self.aw = true;
        self.dp_addr(o + self.x)
    }

    fn am_dp_y(&mut self) -> i32 {
        let o = self.fetch();
        self.dp_penalty();
        self.idle();
        self.aw = true;
        self.dp_addr(o + self.y)
    }

    fn am_dp_ind(&mut self) -> i32 {
        let o = self.fetch();
        self.dp_penalty();
        let a0 = self.dp_addr(o);
        let lo = self.rd(a0);
        let a1 = self.dp_addr(o + 1);
        let hi = self.rd(a1);
        self.aw = false;
        (self.dbr << 16) | lo | (hi << 8)
    }

    fn am_dp_ind_x(&mut self) -> i32 {
        let o = self.fetch();
        self.dp_penalty();
        self.idle();
        let la = self.dp_addr(o + self.x);
        let ha = if self.e { (la & 0xFF00) | ((la + 1) & 0xFF) } else { (la + 1) & 0xFFFF };
        let lo = self.rd(la);
        let hi = self.rd(ha);
        self.aw = false;
        (self.dbr << 16) | lo | (hi << 8)
    }

    fn am_dp_ind_y(&mut self, w: bool) -> i32 {
        let o = self.fetch();
        self.dp_penalty();
        let a0 = self.dp_addr(o);
        let lo = self.rd(a0);
        let a1 = self.dp_addr(o + 1);
        let hi = self.rd(a1);
        let base = (self.dbr << 16) | lo | (hi << 8);
        let addr = (base + self.y) & 0xFFFFFF;
        if w || !self.fx || ((base ^ addr) & 0xFF00) != 0 {
            self.idle();
        }
        self.aw = false;
        addr
    }

    fn am_dp_ind_long(&mut self) -> i32 {
        let o = self.fetch();
        self.dp_penalty();
        let p = (self.d + o) & 0xFFFF;
        let lo = self.rd(p);
        let mid = self.rd((p + 1) & 0xFFFF);
        let hi = self.rd((p + 2) & 0xFFFF);
        self.aw = false;
        lo | (mid << 8) | (hi << 16)
    }

    fn am_dp_ind_long_y(&mut self) -> i32 {
        let o = self.fetch();
        self.dp_penalty();
        let p = (self.d + o) & 0xFFFF;
        let lo = self.rd(p);
        let mid = self.rd((p + 1) & 0xFFFF);
        let hi = self.rd((p + 2) & 0xFFFF);
        self.aw = false;
        ((lo | (mid << 8) | (hi << 16)) + self.y) & 0xFFFFFF
    }

    fn am_abs(&mut self) -> i32 {
        self.aw = false;
        (self.dbr << 16) | self.fetch16()
    }

    fn am_abs_x(&mut self, w: bool) -> i32 {
        let base = (self.dbr << 16) | self.fetch16();
        let addr = (base + self.x) & 0xFFFFFF;
        if w || !self.fx || ((base ^ addr) & 0xFF00) != 0 {
            self.idle();
        }
        self.aw = false;
        addr
    }

    fn am_abs_y(&mut self, w: bool) -> i32 {
        let base = (self.dbr << 16) | self.fetch16();
        let addr = (base + self.y) & 0xFFFFFF;
        if w || !self.fx || ((base ^ addr) & 0xFF00) != 0 {
            self.idle();
        }
        self.aw = false;
        addr
    }

    fn am_long(&mut self) -> i32 {
        self.aw = false;
        self.fetch24()
    }

    fn am_long_x(&mut self) -> i32 {
        self.aw = false;
        (self.fetch24() + self.x) & 0xFFFFFF
    }

    fn am_sr(&mut self) -> i32 {
        let o = self.fetch();
        self.idle();
        self.aw = true;
        (self.s + o) & 0xFFFF
    }

    fn am_sr_ind_y(&mut self) -> i32 {
        let o = self.fetch();
        self.idle();
        let p = (self.s + o) & 0xFFFF;
        let lo = self.rd(p);
        let hi = self.rd((p + 1) & 0xFFFF);
        self.idle();
        self.aw = false;
        (((self.dbr << 16) | lo | (hi << 8)) + self.y) & 0xFFFFFF
    }

    // ---------------- flags auxiliares ----------------
    fn nz_m(&mut self, v: i32) {
        if self.fm {
            self.fz = (v & 0xFF) == 0;
            self.fneg = (v & 0x80) != 0;
        } else {
            self.fz = (v & 0xFFFF) == 0;
            self.fneg = (v & 0x8000) != 0;
        }
    }

    fn nz_x(&mut self, v: i32) {
        if self.fx {
            self.fz = (v & 0xFF) == 0;
            self.fneg = (v & 0x80) != 0;
        } else {
            self.fz = (v & 0xFFFF) == 0;
            self.fneg = (v & 0x8000) != 0;
        }
    }

    fn nz8(&mut self, v: i32) {
        self.fz = (v & 0xFF) == 0;
        self.fneg = (v & 0x80) != 0;
    }

    fn nz16(&mut self, v: i32) {
        self.fz = (v & 0xFFFF) == 0;
        self.fneg = (v & 0x8000) != 0;
    }

    fn get_am(&self) -> i32 {
        if self.fm { self.a & 0xFF } else { self.a }
    }

    fn set_am(&mut self, v: i32) {
        if self.fm {
            self.a = (self.a & 0xFF00) | (v & 0xFF);
        } else {
            self.a = v & 0xFFFF;
        }
    }

    fn mask_x(&self, v: i32) -> i32 {
        if self.fx { v & 0xFF } else { v & 0xFFFF }
    }

    // ---------------- operações (ALU) ----------------
    fn op_ora(&mut self, addr: i32) {
        let v = self.get_am() | self.read_m(addr);
        self.set_am(v);
        self.nz_m(v);
    }

    fn op_and(&mut self, addr: i32) {
        let v = self.get_am() & self.read_m(addr);
        self.set_am(v);
        self.nz_m(v);
    }

    fn op_eor(&mut self, addr: i32) {
        let v = self.get_am() ^ self.read_m(addr);
        self.set_am(v);
        self.nz_m(v);
    }

    fn op_lda(&mut self, addr: i32) {
        let v = self.read_m(addr);
        self.set_am(v);
        self.nz_m(v);
    }

    fn op_sta(&mut self, addr: i32) {
        let v = self.get_am();
        self.write_m(addr, v);
    }

    fn op_stz(&mut self, addr: i32) {
        self.write_m(addr, 0);
    }

    fn op_ldx(&mut self, addr: i32) {
        self.x = self.read_x(addr);
        let x = self.x;
        self.nz_x(x);
    }

    fn op_ldy(&mut self, addr: i32) {
        self.y = self.read_x(addr);
        let y = self.y;
        self.nz_x(y);
    }

    fn op_stx(&mut self, addr: i32) {
        let x = self.x;
        self.write_x(addr, x);
    }

    fn op_sty(&mut self, addr: i32) {
        let y = self.y;
        self.write_x(addr, y);
    }

    fn compare(&mut self, reg: i32, v: i32, wide: bool) {
        let r = reg - v;
        self.fc = r >= 0;
        if wide {
            self.nz16(r);
        } else {
            self.nz8(r);
        }
    }

    fn op_cmp(&mut self, addr: i32) {
        let reg = self.get_am();
        let v = self.read_m(addr);
        let wide = !self.fm;
        self.compare(reg, v, wide);
    }

    fn op_cpx(&mut self, addr: i32) {
        let reg = self.x;
        let v = self.read_x(addr);
        let wide = !self.fx;
        self.compare(reg, v, wide);
    }

    fn op_cpy(&mut self, addr: i32) {
        let reg = self.y;
        let v = self.read_x(addr);
        let wide = !self.fx;
        self.compare(reg, v, wide);
    }

    fn op_bit(&mut self, addr: i32) {
        let v = self.read_m(addr);
        if self.fm {
            self.fneg = (v & 0x80) != 0;
            self.fv = (v & 0x40) != 0;
            self.fz = (v & self.a & 0xFF) == 0;
        } else {
            self.fneg = (v & 0x8000) != 0;
            self.fv = (v & 0x4000) != 0;
            self.fz = (v & self.a) == 0;
        }
    }

    fn op_bit_imm(&mut self, addr: i32) {
        let v = self.read_m(addr);
        if self.fm {
            self.fz = (v & self.a & 0xFF) == 0;
        } else {
            self.fz = (v & self.a) == 0;
        }
    }

    fn op_adc(&mut self, addr: i32) {
        let data = self.read_m(addr);
        let c = if self.fc { 1 } else { 0 };
        let mut r;
        if self.fm {
            let av = self.a & 0xFF;
            if !self.fd {
                r = av + data + c;
            } else {
                r = (av & 0x0F) + (data & 0x0F) + c;
                if r > 0x09 { r += 0x06; }
                let cc = if r > 0x0F { 1 } else { 0 };
                r = (av & 0xF0) + (data & 0xF0) + (cc << 4) + (r & 0x0F);
            }
            self.fv = ((av ^ data ^ 0xFF) & (av ^ r) & 0x80) != 0;
            if self.fd && r > 0x9F { r += 0x60; }
            self.fc = r > 0xFF;
            self.a = (self.a & 0xFF00) | (r & 0xFF);
            self.nz8(r);
        } else {
            let av = self.a;
            if !self.fd {
                r = av + data + c;
            } else {
                r = (av & 0x000F) + (data & 0x000F) + c;
                if r > 0x0009 { r += 0x0006; }
                let c1 = if r > 0x000F { 1 } else { 0 };
                r = (av & 0x00F0) + (data & 0x00F0) + (c1 << 4) + (r & 0x000F);
                if r > 0x009F { r += 0x0060; }
                let c2 = if r > 0x00FF { 1 } else { 0 };
                r = (av & 0x0F00) + (data & 0x0F00) + (c2 << 8) + (r & 0x00FF);
                if r > 0x09FF { r += 0x0600; }
                let c3 = if r > 0x0FFF { 1 } else { 0 };
                r = (av & 0xF000) + (data & 0xF000) + (c3 << 12) + (r & 0x0FFF);
            }
            self.fv = ((av ^ data ^ 0xFFFF) & (av ^ r) & 0x8000) != 0;
            if self.fd && r > 0x9FFF { r += 0x6000; }
            self.fc = r > 0xFFFF;
            self.a = r & 0xFFFF;
            self.nz16(r);
        }
    }

    fn op_sbc(&mut self, addr: i32) {
        let c = if self.fc { 1 } else { 0 };
        let mut r;
        if self.fm {
            let data = self.read_m(addr) ^ 0xFF;
            let av = self.a & 0xFF;
            if !self.fd {
                r = av + data + c;
            } else {
                r = (av & 0x0F) + (data & 0x0F) + c;
                if r <= 0x0F { r -= 0x06; }
                let cc = if r > 0x0F { 1 } else { 0 };
                r = (av & 0xF0) + (data & 0xF0) + (cc << 4) + (r & 0x0F);
            }
            self.fv = ((av ^ data ^ 0xFF) & (av ^ r) & 0x80) != 0;
            if self.fd && r <= 0xFF { r -= 0x60; }
            self.fc = r > 0xFF;
            self.a = (self.a & 0xFF00) | (r & 0xFF);
            self.nz8(r);
        } else {
            let data = self.read_m(addr) ^ 0xFFFF;
            let av = self.a;
            if !self.fd {
                r = av + data + c;
            } else {
                r = (av & 0x000F) + (data & 0x000F) + c;
                if r <= 0x000F { r -= 0x0006; }
                let c1 = if r > 0x000F { 1 } else { 0 };
                r = (av & 0x00F0) + (data & 0x00F0) + (c1 << 4) + (r & 0x000F);
                if r <= 0x00FF { r -= 0x0060; }
                let c2 = if r > 0x00FF { 1 } else { 0 };
                r = (av & 0x0F00) + (data & 0x0F00) + (c2 << 8) + (r & 0x00FF);
                if r <= 0x0FFF { r -= 0x0600; }
                let c3 = if r > 0x0FFF { 1 } else { 0 };
                r = (av & 0xF000) + (data & 0xF000) + (c3 << 12) + (r & 0x0FFF);
            }
            self.fv = ((av ^ data ^ 0xFFFF) & (av ^ r) & 0x8000) != 0;
            if self.fd && r <= 0xFFFF { r -= 0x6000; }
            self.fc = r > 0xFFFF;
            self.a = r & 0xFFFF;
            self.nz16(r);
        }
    }

    // ---------------- read-modify-write ----------------
    // kind: 0 ASL, 1 ROL, 2 LSR, 3 ROR, 4 INC, 5 DEC, 6 TSB, 7 TRB
    fn alter(&mut self, kind: i32, v: i32, wide: bool) -> i32 {
        let (top, mask) = if wide { (0x8000, 0xFFFF) } else { (0x80, 0xFF) };
        let r;
        match kind {
            0 => {
                self.fc = (v & top) != 0;
                r = (v << 1) & mask;
            }
            1 => {
                let c = if self.fc { 1 } else { 0 };
                self.fc = (v & top) != 0;
                r = ((v << 1) | c) & mask;
            }
            2 => {
                self.fc = (v & 1) != 0;
                r = v >> 1;
            }
            3 => {
                let c = if self.fc { top } else { 0 };
                self.fc = (v & 1) != 0;
                r = (v >> 1) | c;
            }
            4 => r = (v + 1) & mask,
            5 => r = (v - 1) & mask,
            6 => {
                self.fz = (v & self.a & mask) == 0;
                return (v | self.a) & mask;
            }
            _ => {
                self.fz = (v & self.a & mask) == 0;
                return v & (self.a ^ 0xFFFF) & mask;
            }
        }
        if wide {
            self.nz16(r);
        } else {
            self.nz8(r);
        }
        r
    }

    fn rmw(&mut self, kind: i32, addr: i32) {
        if self.fm {
            let v = self.rd(addr);
            self.idle();
            let r = self.alter(kind, v, false);
            self.wr(addr, r);
        } else {
            let ha = self.hi_addr(addr);
            let lo = self.rd(addr);
            let v = lo | (self.rd(ha) << 8);
            self.idle();
            let r = self.alter(kind, v, true);
            self.wr(ha, r >> 8);
            self.wr(addr, r);
        }
    }

    fn rmw_a(&mut self, kind: i32) {
        self.idle();
        if self.fm {
            let v = self.a & 0xFF;
            let r = self.alter(kind, v, false);
            self.a = (self.a & 0xFF00) | r;
        } else {
            let v = self.a;
            self.a = self.alter(kind, v, true);
        }
    }

    // ---------------- desvios ----------------
    fn branch(&mut self, cond: bool) {
        let mut off = self.fetch();
        if cond {
            if off >= 0x80 { off -= 0x100; }
            let npc = (self.pc + off) & 0xFFFF;
            self.idle();
            if self.e && ((npc ^ self.pc) & 0xFF00) != 0 {
                self.idle();
            }
            self.pc = npc;
        }
    }

    // ---------------- interrupções ----------------
    fn interrupt(&mut self, native_vec: i32, emu_vec: i32, soft: bool) {
        if !self.e {
            let b = self.pbr;
            self.push8(b);
        }
        let pc = self.pc;
        self.push16(pc);
        let mut p = self.get_p();
        if self.e && !soft {
            p &= 0xEF;
        }
        self.push8(p);
        self.fi = true;
        self.fd = false;
        self.pbr = 0;
        let vec = if self.e { emu_vec } else { native_vec };
        self.pc = self.rd(vec) | (self.rd(vec + 1) << 8);
    }

    /// Executa uma instrução (ou atende uma interrupção pendente).
    pub fn step(&mut self) {
        if self.stopped {
            self.idle();
            return;
        }
        if self.waiting {
            if self.nmi_pending || self.irq_line {
                self.waiting = false;
                self.idle();
                self.idle();
            } else {
                self.idle();
                return;
            }
        }
        if self.nmi_pending {
            self.nmi_pending = false;
            self.idle();
            self.idle();
            self.interrupt(0xFFEA, 0xFFFA, false);
            return;
        }
        if self.irq_line && !self.fi {
            self.idle();
            self.idle();
            self.interrupt(0xFFEE, 0xFFFE, false);
            return;
        }
        let op = self.fetch();
        self.last_op = op;
        self.execute(op);
    }

    fn execute(&mut self, op: i32) {
        match op {
            // ---- 0x ----
            0x00 => { self.fetch(); self.interrupt(0xFFE6, 0xFFFE, true); }
            0x01 => { let a = self.am_dp_ind_x(); self.op_ora(a); }
            0x02 => { self.fetch(); self.interrupt(0xFFE4, 0xFFF4, true); }
            0x03 => { let a = self.am_sr(); self.op_ora(a); }
            0x04 => { let a = self.am_dp(); self.rmw(6, a); }
            0x05 => { let a = self.am_dp(); self.op_ora(a); }
            0x06 => { let a = self.am_dp(); self.rmw(0, a); }
            0x07 => { let a = self.am_dp_ind_long(); self.op_ora(a); }
            0x08 => { self.idle(); let p = self.get_p(); self.push8(p); }
            0x09 => { let a = self.am_imm_m(); self.op_ora(a); }
            0x0A => self.rmw_a(0),
            0x0B => {
                self.idle();
                let d = self.d;
                self.push_n(d >> 8);
                self.push_n(d);
                self.fix_s();
            }
            0x0C => { let a = self.am_abs(); self.rmw(6, a); }
            0x0D => { let a = self.am_abs(); self.op_ora(a); }
            0x0E => { let a = self.am_abs(); self.rmw(0, a); }
            0x0F => { let a = self.am_long(); self.op_ora(a); }
            // ---- 1x ----
            0x10 => { let c = !self.fneg; self.branch(c); }
            0x11 => { let a = self.am_dp_ind_y(false); self.op_ora(a); }
            0x12 => { let a = self.am_dp_ind(); self.op_ora(a); }
            0x13 => { let a = self.am_sr_ind_y(); self.op_ora(a); }
            0x14 => { let a = self.am_dp(); self.rmw(7, a); }
            0x15 => { let a = self.am_dp_x(); self.op_ora(a); }
            0x16 => { let a = self.am_dp_x(); self.rmw(0, a); }
            0x17 => { let a = self.am_dp_ind_long_y(); self.op_ora(a); }
            0x18 => { self.idle(); self.fc = false; }
            0x19 => { let a = self.am_abs_y(false); self.op_ora(a); }
            0x1A => self.rmw_a(4),
            0x1B => {
                self.idle();
                if self.e { self.s = 0x100 | (self.a & 0xFF); } else { self.s = self.a; }
            }
            0x1C => { let a = self.am_abs(); self.rmw(7, a); }
            0x1D => { let a = self.am_abs_x(false); self.op_ora(a); }
            0x1E => { let a = self.am_abs_x(true); self.rmw(0, a); }
            0x1F => { let a = self.am_long_x(); self.op_ora(a); }
            // ---- 2x ----
            0x20 => {
                let t = self.fetch16();
                self.idle();
                let r = (self.pc - 1) & 0xFFFF;
                self.push16(r);
                self.pc = t;
            }
            0x21 => { let a = self.am_dp_ind_x(); self.op_and(a); }
            0x22 => {
                let lo = self.fetch();
                let hi = self.fetch();
                let b = self.pbr;
                self.push_n(b);
                self.idle();
                let bank = self.fetch();
                let ret = (self.pc - 1) & 0xFFFF;
                self.push_n(ret >> 8);
                self.push_n(ret);
                self.fix_s();
                self.pc = lo | (hi << 8);
                self.pbr = bank;
            }
            0x23 => { let a = self.am_sr(); self.op_and(a); }
            0x24 => { let a = self.am_dp(); self.op_bit(a); }
            0x25 => { let a = self.am_dp(); self.op_and(a); }
            0x26 => { let a = self.am_dp(); self.rmw(1, a); }
            0x27 => { let a = self.am_dp_ind_long(); self.op_and(a); }
            0x28 => { self.idle(); self.idle(); let p = self.pull8(); self.set_p(p); }
            0x29 => { let a = self.am_imm_m(); self.op_and(a); }
            0x2A => self.rmw_a(1),
            0x2B => {
                self.idle();
                self.idle();
                let lo = self.pull_n();
                self.d = lo | (self.pull_n() << 8);
                self.fix_s();
                let d = self.d;
                self.nz16(d);
            }
            0x2C => { let a = self.am_abs(); self.op_bit(a); }
            0x2D => { let a = self.am_abs(); self.op_and(a); }
            0x2E => { let a = self.am_abs(); self.rmw(1, a); }
            0x2F => { let a = self.am_long(); self.op_and(a); }
            // ---- 3x ----
            0x30 => { let c = self.fneg; self.branch(c); }
            0x31 => { let a = self.am_dp_ind_y(false); self.op_and(a); }
            0x32 => { let a = self.am_dp_ind(); self.op_and(a); }
            0x33 => { let a = self.am_sr_ind_y(); self.op_and(a); }
            0x34 => { let a = self.am_dp_x(); self.op_bit(a); }
            0x35 => { let a = self.am_dp_x(); self.op_and(a); }
            0x36 => { let a = self.am_dp_x(); self.rmw(1, a); }
            0x37 => { let a = self.am_dp_ind_long_y(); self.op_and(a); }
            0x38 => { self.idle(); self.fc = true; }
            0x39 => { let a = self.am_abs_y(false); self.op_and(a); }
            0x3A => self.rmw_a(5),
            0x3B => { self.idle(); self.a = self.s; let a = self.a; self.nz16(a); }
            0x3C => { let a = self.am_abs_x(false); self.op_bit(a); }
            0x3D => { let a = self.am_abs_x(false); self.op_and(a); }
            0x3E => { let a = self.am_abs_x(true); self.rmw(1, a); }
            0x3F => { let a = self.am_long_x(); self.op_and(a); }
            // ---- 4x ----
            0x40 => {
                self.idle();
                self.idle();
                let p = self.pull8();
                self.set_p(p);
                self.pc = self.pull16();
                if !self.e { self.pbr = self.pull8(); }
            }
            0x41 => { let a = self.am_dp_ind_x(); self.op_eor(a); }
            0x42 => { self.fetch(); }
            0x43 => { let a = self.am_sr(); self.op_eor(a); }
            0x44 => self.block_move(-1),
            0x45 => { let a = self.am_dp(); self.op_eor(a); }
            0x46 => { let a = self.am_dp(); self.rmw(2, a); }
            0x47 => { let a = self.am_dp_ind_long(); self.op_eor(a); }
            0x48 => {
                self.idle();
                let a = self.a;
                if self.fm { self.push8(a); } else { self.push16(a); }
            }
            0x49 => { let a = self.am_imm_m(); self.op_eor(a); }
            0x4A => self.rmw_a(2),
            0x4B => { self.idle(); let b = self.pbr; self.push8(b); }
            0x4C => { self.pc = self.fetch16(); }
            0x4D => { let a = self.am_abs(); self.op_eor(a); }
            0x4E => { let a = self.am_abs(); self.rmw(2, a); }
            0x4F => { let a = self.am_long(); self.op_eor(a); }
            // ---- 5x ----
            0x50 => { let c = !self.fv; self.branch(c); }
            0x51 => { let a = self.am_dp_ind_y(false); self.op_eor(a); }
            0x52 => { let a = self.am_dp_ind(); self.op_eor(a); }
            0x53 => { let a = self.am_sr_ind_y(); self.op_eor(a); }
            0x54 => self.block_move(1),
            0x55 => { let a = self.am_dp_x(); self.op_eor(a); }
            0x56 => { let a = self.am_dp_x(); self.rmw(2, a); }
            0x57 => { let a = self.am_dp_ind_long_y(); self.op_eor(a); }
            0x58 => { self.idle(); self.fi = false; }
            0x59 => { let a = self.am_abs_y(false); self.op_eor(a); }
            0x5A => {
                self.idle();
                let y = self.y;
                if self.fx { self.push8(y); } else { self.push16(y); }
            }
            0x5B => { self.idle(); self.d = self.a; let d = self.d; self.nz16(d); }
            0x5C => {
                let t = self.fetch24();
                self.pc = t & 0xFFFF;
                self.pbr = t >> 16;
            }
            0x5D => { let a = self.am_abs_x(false); self.op_eor(a); }
            0x5E => { let a = self.am_abs_x(true); self.rmw(2, a); }
            0x5F => { let a = self.am_long_x(); self.op_eor(a); }
            // ---- 6x ----
            0x60 => {
                self.idle();
                self.idle();
                self.pc = (self.pull16() + 1) & 0xFFFF;
                self.idle();
            }
            0x61 => { let a = self.am_dp_ind_x(); self.op_adc(a); }
            0x62 => {
                let off = self.fetch16();
                self.idle();
                let v = (self.pc + off) & 0xFFFF;
                self.push_n(v >> 8);
                self.push_n(v);
                self.fix_s();
            }
            0x63 => { let a = self.am_sr(); self.op_adc(a); }
            0x64 => { let a = self.am_dp(); self.op_stz(a); }
            0x65 => { let a = self.am_dp(); self.op_adc(a); }
            0x66 => { let a = self.am_dp(); self.rmw(3, a); }
            0x67 => { let a = self.am_dp_ind_long(); self.op_adc(a); }
            0x68 => {
                self.idle();
                self.idle();
                if self.fm {
                    let v = self.pull8();
                    self.a = (self.a & 0xFF00) | v;
                    let a = self.a;
                    self.nz8(a);
                } else {
                    self.a = self.pull16();
                    let a = self.a;
                    self.nz16(a);
                }
            }
            0x69 => { let a = self.am_imm_m(); self.op_adc(a); }
            0x6A => self.rmw_a(3),
            0x6B => {
                self.idle();
                self.idle();
                let lo = self.pull_n();
                let hi = self.pull_n();
                self.pbr = self.pull_n();
                self.fix_s();
                self.pc = ((lo | (hi << 8)) + 1) & 0xFFFF;
            }
            0x6C => {
                let p = self.fetch16();
                let lo = self.rd(p);
                self.pc = lo | (self.rd((p + 1) & 0xFFFF) << 8);
            }
            0x6D => { let a = self.am_abs(); self.op_adc(a); }
            0x6E => { let a = self.am_abs(); self.rmw(3, a); }
            0x6F => { let a = self.am_long(); self.op_adc(a); }
            // ---- 7x ----
            0x70 => { let c = self.fv; self.branch(c); }
            0x71 => { let a = self.am_dp_ind_y(false); self.op_adc(a); }
            0x72 => { let a = self.am_dp_ind(); self.op_adc(a); }
            0x73 => { let a = self.am_sr_ind_y(); self.op_adc(a); }
            0x74 => { let a = self.am_dp_x(); self.op_stz(a); }
            0x75 => { let a = self.am_dp_x(); self.op_adc(a); }
            0x76 => { let a = self.am_dp_x(); self.rmw(3, a); }
            0x77 => { let a = self.am_dp_ind_long_y(); self.op_adc(a); }
            0x78 => { self.idle(); self.fi = true; }
            0x79 => { let a = self.am_abs_y(false); self.op_adc(a); }
            0x7A => {
                self.idle();
                self.idle();
                if self.fx {
                    self.y = self.pull8();
                    let y = self.y;
                    self.nz8(y);
                } else {
                    self.y = self.pull16();
                    let y = self.y;
                    self.nz16(y);
                }
            }
            0x7B => { self.idle(); self.a = self.d; let a = self.a; self.nz16(a); }
            0x7C => {
                let p = self.fetch16();
                self.idle();
                let pa = (p + self.x) & 0xFFFF;
                let lo = self.rd((self.pbr << 16) | pa);
                let hi = self.rd((self.pbr << 16) | ((pa + 1) & 0xFFFF));
                self.pc = lo | (hi << 8);
            }
            0x7D => { let a = self.am_abs_x(false); self.op_adc(a); }
            0x7E => { let a = self.am_abs_x(true); self.rmw(3, a); }
            0x7F => { let a = self.am_long_x(); self.op_adc(a); }
            // ---- 8x ----
            0x80 => self.branch(true),
            0x81 => { let a = self.am_dp_ind_x(); self.op_sta(a); }
            0x82 => {
                let off = self.fetch16();
                self.idle();
                self.pc = (self.pc + off) & 0xFFFF;
            }
            0x83 => { let a = self.am_sr(); self.op_sta(a); }
            0x84 => { let a = self.am_dp(); self.op_sty(a); }
            0x85 => { let a = self.am_dp(); self.op_sta(a); }
            0x86 => { let a = self.am_dp(); self.op_stx(a); }
            0x87 => { let a = self.am_dp_ind_long(); self.op_sta(a); }
            0x88 => {
                self.idle();
                let v = self.y - 1;
                self.y = self.mask_x(v);
                let y = self.y;
                self.nz_x(y);
            }
            0x89 => { let a = self.am_imm_m(); self.op_bit_imm(a); }
            0x8A => {
                self.idle();
                let x = self.x;
                self.set_am(x);
                self.nz_m(x);
            }
            0x8B => { self.idle(); let b = self.dbr; self.push8(b); }
            0x8C => { let a = self.am_abs(); self.op_sty(a); }
            0x8D => { let a = self.am_abs(); self.op_sta(a); }
            0x8E => { let a = self.am_abs(); self.op_stx(a); }
            0x8F => { let a = self.am_long(); self.op_sta(a); }
            // ---- 9x ----
            0x90 => { let c = !self.fc; self.branch(c); }
            0x91 => { let a = self.am_dp_ind_y(true); self.op_sta(a); }
            0x92 => { let a = self.am_dp_ind(); self.op_sta(a); }
            0x93 => { let a = self.am_sr_ind_y(); self.op_sta(a); }
            0x94 => { let a = self.am_dp_x(); self.op_sty(a); }
            0x95 => { let a = self.am_dp_x(); self.op_sta(a); }
            0x96 => { let a = self.am_dp_y(); self.op_stx(a); }
            0x97 => { let a = self.am_dp_ind_long_y(); self.op_sta(a); }
            0x98 => {
                self.idle();
                let y = self.y;
                self.set_am(y);
                self.nz_m(y);
            }
            0x99 => { let a = self.am_abs_y(true); self.op_sta(a); }
            0x9A => {
                self.idle();
                if self.e { self.s = 0x100 | (self.x & 0xFF); } else { self.s = self.x; }
            }
            0x9B => {
                self.idle();
                self.y = self.x;
                let y = self.y;
                self.nz_x(y);
            }
            0x9C => { let a = self.am_abs(); self.op_stz(a); }
            0x9D => { let a = self.am_abs_x(true); self.op_sta(a); }
            0x9E => { let a = self.am_abs_x(true); self.op_stz(a); }
            0x9F => { let a = self.am_long_x(); self.op_sta(a); }
            // ---- Ax ----
            0xA0 => { let a = self.am_imm_x(); self.op_ldy(a); }
            0xA1 => { let a = self.am_dp_ind_x(); self.op_lda(a); }
            0xA2 => { let a = self.am_imm_x(); self.op_ldx(a); }
            0xA3 => { let a = self.am_sr(); self.op_lda(a); }
            0xA4 => { let a = self.am_dp(); self.op_ldy(a); }
            0xA5 => { let a = self.am_dp(); self.op_lda(a); }
            0xA6 => { let a = self.am_dp(); self.op_ldx(a); }
            0xA7 => { let a = self.am_dp_ind_long(); self.op_lda(a); }
            0xA8 => {
                self.idle();
                self.y = self.mask_x(self.a);
                let y = self.y;
                self.nz_x(y);
            }
            0xA9 => { let a = self.am_imm_m(); self.op_lda(a); }
            0xAA => {
                self.idle();
                self.x = self.mask_x(self.a);
                let x = self.x;
                self.nz_x(x);
            }
            0xAB => {
                self.idle();
                self.idle();
                self.dbr = self.pull_n();
                self.fix_s();
                let d = self.dbr;
                self.nz8(d);
            }
            0xAC => { let a = self.am_abs(); self.op_ldy(a); }
            0xAD => { let a = self.am_abs(); self.op_lda(a); }
            0xAE => { let a = self.am_abs(); self.op_ldx(a); }
            0xAF => { let a = self.am_long(); self.op_lda(a); }
            // ---- Bx ----
            0xB0 => { let c = self.fc; self.branch(c); }
            0xB1 => { let a = self.am_dp_ind_y(false); self.op_lda(a); }
            0xB2 => { let a = self.am_dp_ind(); self.op_lda(a); }
            0xB3 => { let a = self.am_sr_ind_y(); self.op_lda(a); }
            0xB4 => { let a = self.am_dp_x(); self.op_ldy(a); }
            0xB5 => { let a = self.am_dp_x(); self.op_lda(a); }
            0xB6 => { let a = self.am_dp_y(); self.op_ldx(a); }
            0xB7 => { let a = self.am_dp_ind_long_y(); self.op_lda(a); }
            0xB8 => { self.idle(); self.fv = false; }
            0xB9 => { let a = self.am_abs_y(false); self.op_lda(a); }
            0xBA => {
                self.idle();
                self.x = self.mask_x(self.s);
                let x = self.x;
                self.nz_x(x);
            }
            0xBB => {
                self.idle();
                self.x = self.y;
                let x = self.x;
                self.nz_x(x);
            }
            0xBC => { let a = self.am_abs_x(false); self.op_ldy(a); }
            0xBD => { let a = self.am_abs_x(false); self.op_lda(a); }
            0xBE => { let a = self.am_abs_y(false); self.op_ldx(a); }
            0xBF => { let a = self.am_long_x(); self.op_lda(a); }
            // ---- Cx ----
            0xC0 => { let a = self.am_imm_x(); self.op_cpy(a); }
            0xC1 => { let a = self.am_dp_ind_x(); self.op_cmp(a); }
            0xC2 => {
                let v = self.fetch();
                self.idle();
                let p = self.get_p() & (v ^ 0xFF);
                self.set_p(p);
            }
            0xC3 => { let a = self.am_sr(); self.op_cmp(a); }
            0xC4 => { let a = self.am_dp(); self.op_cpy(a); }
            0xC5 => { let a = self.am_dp(); self.op_cmp(a); }
            0xC6 => { let a = self.am_dp(); self.rmw(5, a); }
            0xC7 => { let a = self.am_dp_ind_long(); self.op_cmp(a); }
            0xC8 => {
                self.idle();
                let v = self.y + 1;
                self.y = self.mask_x(v);
                let y = self.y;
                self.nz_x(y);
            }
            0xC9 => { let a = self.am_imm_m(); self.op_cmp(a); }
            0xCA => {
                self.idle();
                let v = self.x - 1;
                self.x = self.mask_x(v);
                let x = self.x;
                self.nz_x(x);
            }
            0xCB => { self.idle(); self.idle(); self.waiting = true; }
            0xCC => { let a = self.am_abs(); self.op_cpy(a); }
            0xCD => { let a = self.am_abs(); self.op_cmp(a); }
            0xCE => { let a = self.am_abs(); self.rmw(5, a); }
            0xCF => { let a = self.am_long(); self.op_cmp(a); }
            // ---- Dx ----
            0xD0 => { let c = !self.fz; self.branch(c); }
            0xD1 => { let a = self.am_dp_ind_y(false); self.op_cmp(a); }
            0xD2 => { let a = self.am_dp_ind(); self.op_cmp(a); }
            0xD3 => { let a = self.am_sr_ind_y(); self.op_cmp(a); }
            0xD4 => {
                let o = self.fetch();
                self.dp_penalty();
                let lo = self.rd((self.d + o) & 0xFFFF);
                let hi = self.rd((self.d + o + 1) & 0xFFFF);
                self.push_n(hi);
                self.push_n(lo);
                self.fix_s();
            }
            0xD5 => { let a = self.am_dp_x(); self.op_cmp(a); }
            0xD6 => { let a = self.am_dp_x(); self.rmw(5, a); }
            0xD7 => { let a = self.am_dp_ind_long_y(); self.op_cmp(a); }
            0xD8 => { self.idle(); self.fd = false; }
            0xD9 => { let a = self.am_abs_y(false); self.op_cmp(a); }
            0xDA => {
                self.idle();
                let x = self.x;
                if self.fx { self.push8(x); } else { self.push16(x); }
            }
            0xDB => { self.idle(); self.idle(); self.stopped = true; }
            0xDC => {
                let p = self.fetch16();
                let lo = self.rd(p);
                let mid = self.rd((p + 1) & 0xFFFF);
                self.pbr = self.rd((p + 2) & 0xFFFF);
                self.pc = lo | (mid << 8);
            }
            0xDD => { let a = self.am_abs_x(false); self.op_cmp(a); }
            0xDE => { let a = self.am_abs_x(true); self.rmw(5, a); }
            0xDF => { let a = self.am_long_x(); self.op_cmp(a); }
            // ---- Ex ----
            0xE0 => { let a = self.am_imm_x(); self.op_cpx(a); }
            0xE1 => { let a = self.am_dp_ind_x(); self.op_sbc(a); }
            0xE2 => {
                let v = self.fetch();
                self.idle();
                let p = self.get_p() | v;
                self.set_p(p);
            }
            0xE3 => { let a = self.am_sr(); self.op_sbc(a); }
            0xE4 => { let a = self.am_dp(); self.op_cpx(a); }
            0xE5 => { let a = self.am_dp(); self.op_sbc(a); }
            0xE6 => { let a = self.am_dp(); self.rmw(4, a); }
            0xE7 => { let a = self.am_dp_ind_long(); self.op_sbc(a); }
            0xE8 => {
                self.idle();
                let v = self.x + 1;
                self.x = self.mask_x(v);
                let x = self.x;
                self.nz_x(x);
            }
            0xE9 => { let a = self.am_imm_m(); self.op_sbc(a); }
            0xEA => self.idle(),
            0xEB => {
                self.idle();
                self.idle();
                self.a = ((self.a >> 8) & 0xFF) | ((self.a & 0xFF) << 8);
                let a = self.a;
                self.nz8(a);
            }
            0xEC => { let a = self.am_abs(); self.op_cpx(a); }
            0xED => { let a = self.am_abs(); self.op_sbc(a); }
            0xEE => { let a = self.am_abs(); self.rmw(4, a); }
            0xEF => { let a = self.am_long(); self.op_sbc(a); }
            // ---- Fx ----
            0xF0 => { let c = self.fz; self.branch(c); }
            0xF1 => { let a = self.am_dp_ind_y(false); self.op_sbc(a); }
            0xF2 => { let a = self.am_dp_ind(); self.op_sbc(a); }
            0xF3 => { let a = self.am_sr_ind_y(); self.op_sbc(a); }
            0xF4 => {
                let v = self.fetch16();
                self.push_n(v >> 8);
                self.push_n(v);
                self.fix_s();
            }
            0xF5 => { let a = self.am_dp_x(); self.op_sbc(a); }
            0xF6 => { let a = self.am_dp_x(); self.rmw(4, a); }
            0xF7 => { let a = self.am_dp_ind_long_y(); self.op_sbc(a); }
            0xF8 => { self.idle(); self.fd = true; }
            0xF9 => { let a = self.am_abs_y(false); self.op_sbc(a); }
            0xFA => {
                self.idle();
                self.idle();
                if self.fx {
                    self.x = self.pull8();
                    let x = self.x;
                    self.nz8(x);
                } else {
                    self.x = self.pull16();
                    let x = self.x;
                    self.nz16(x);
                }
            }
            0xFB => {
                self.idle();
                let oc = self.fc;
                self.fc = self.e;
                self.e = oc;
                if self.e {
                    self.fm = true;
                    self.fx = true;
                    self.x &= 0xFF;
                    self.y &= 0xFF;
                    self.s = 0x100 | (self.s & 0xFF);
                }
            }
            0xFC => {
                let lo = self.fetch();
                let pc = self.pc;
                self.push_n(pc >> 8);
                self.push_n(pc);
                let hi = self.fetch();
                self.idle();
                let pa = ((lo | (hi << 8)) + self.x) & 0xFFFF;
                let tl = self.rd((self.pbr << 16) | pa);
                let th = self.rd((self.pbr << 16) | ((pa + 1) & 0xFFFF));
                self.pc = tl | (th << 8);
                self.fix_s();
            }
            0xFD => { let a = self.am_abs_x(false); self.op_sbc(a); }
            0xFE => { let a = self.am_abs_x(true); self.rmw(4, a); }
            _ => { let a = self.am_long_x(); self.op_sbc(a); }   // 0xFF
        }
    }

    // MVN (dir=1) / MVP (dir=-1): copia um byte por execução e repete a
    // própria instrução até A estourar para $FFFF.
    fn block_move(&mut self, dir: i32) {
        let dst = self.fetch();
        let src = self.fetch();
        self.dbr = dst;
        let v = self.rd((src << 16) | self.x);
        self.wr((dst << 16) | self.y, v);
        self.idle();
        self.idle();
        let x = self.x + dir;
        self.x = self.mask_x(x);
        let y = self.y + dir;
        self.y = self.mask_x(y);
        self.a = (self.a - 1) & 0xFFFF;
        if self.a != 0xFFFF {
            self.pc = (self.pc - 3) & 0xFFFF;
        }
    }
}
