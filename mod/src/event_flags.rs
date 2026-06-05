// Event flag memory reader — adapted from ER_boss_checklist GameManipulation

use hudhook::tracing::{error, info, warn};
use mem_rs::pointer::Pointer;
use mem_rs::prelude::ReadWrite;
use mem_rs::process::Process;

/// Reads Elden Ring event flags from game memory.
pub struct EventFlagReader {
    process: Process,
    event_data_man: Pointer,
    event_flag_addr: u64,
}

impl EventFlagReader {
    /// Initialize pattern scans and resolve the event flag base address.
    pub fn new() -> Option<Self> {
        let mut process = Process::new("eldenring.exe");

        if process.refresh().is_err() {
            error!("Failed to refresh process for event flag reader");
            return None;
        }

        let event_data_man = match process.scan_rel(
            "EventDataMan",
            "48 8B 3D ? ? ? ? 48 85 FF ? ? 32 C0 E9",
            3,
            7,
            vec![0],
        ) {
            Ok(p) => p,
            Err(e) => {
                error!("Failed to scan EventDataMan: {:?}", e);
                return None;
            }
        };

        let mut reader = Self {
            process,
            event_data_man,
            event_flag_addr: 0,
        };

        reader.resolve_event_flag_addr();

        if reader.event_flag_addr == 0 {
            warn!("Event flag base address could not be resolved");
            return None;
        }

        info!(
            "Event flag reader initialized (event_flag_addr: 0x{:x})",
            reader.event_flag_addr
        );

        Some(reader)
    }

    fn resolve_event_flag_addr(&mut self) {
        if self.event_flag_addr != 0 {
            return;
        }

        let addr1 = self.event_data_man.read_u64_rel(None);
        let addr2_pointer = self
            .process
            .create_pointer((addr1 + 0x28) as usize, vec![0]);
        self.event_flag_addr = addr2_pointer.read_u64_rel(None);
    }

    fn resolve_event_flag(&self, event_flag: u32) -> (Pointer, u8) {
        if self.event_flag_addr == 0 {
            return (Pointer::default(), 0);
        }

        let addr = self.event_data_man.read_u64_rel(None);
        let divisor_ptr = self
            .process
            .create_pointer((addr + 0x1C) as usize, vec![0]);
        let divisor = divisor_ptr.read_u32_rel(None);

        let category = event_flag / divisor;
        let least_significant_digits = event_flag - category * divisor;

        let current_element_ptr = self
            .process
            .create_pointer((addr + 0x38) as usize, vec![0]);
        let mut current_element = current_element_ptr.read_u64_rel(None);
        let current_sub_element_ptr = self
            .process
            .create_pointer((current_element + 0x08) as usize, vec![0]);
        let mut current_sub_element = current_sub_element_ptr.read_u64_rel(None);

        while self
            .process
            .create_pointer((current_sub_element + 0x19) as usize, vec![0])
            .read_u8_rel(None)
            == 0
        {
            if self
                .process
                .create_pointer((current_sub_element + 0x20) as usize, vec![0])
                .read_u32_rel(None)
                < category
            {
                let next_ptr = self
                    .process
                    .create_pointer((current_sub_element + 0x10) as usize, vec![0]);
                current_sub_element = next_ptr.read_u64_rel(None);
            } else {
                current_element = current_sub_element;
                let next_ptr = self
                    .process
                    .create_pointer(current_sub_element as usize, vec![0]);
                current_sub_element = next_ptr.read_u64_rel(None);
            }
        }

        if current_element == current_sub_element {
            return (Pointer::default(), 0);
        }

        let mystery_value_ptr = self
            .process
            .create_pointer((current_element + 0x28) as usize, vec![0]);
        let mystery_value = mystery_value_ptr.read_u32_rel(None) - 1;

        let calculated_pointer = if mystery_value != 0 {
            if mystery_value != 1 {
                let calc_ptr = self
                    .process
                    .create_pointer((current_element + 0x30) as usize, vec![0]);
                calc_ptr.read_u64_rel(None)
            } else {
                return (Pointer::default(), 0);
            }
        } else {
            let factor_ptr = self
                .process
                .create_pointer((addr + 0x20) as usize, vec![0]);
            let factor = factor_ptr.read_u32_rel(None) as u64;

            let multiplier_ptr = self
                .process
                .create_pointer((current_element + 0x30) as usize, vec![0]);
            let multiplier = multiplier_ptr.read_u32_rel(None) as u64;

            factor * multiplier + self.event_flag_addr
        };

        if calculated_pointer == 0 {
            return (Pointer::default(), 0);
        }

        let thing = 7 - (least_significant_digits & 7);
        let shifted = (least_significant_digits >> 3) as u64;

        let final_pointer = self
            .process
            .create_pointer((calculated_pointer + shifted) as usize, vec![0]);
        let final_bits = 1 << thing;

        (final_pointer, final_bits)
    }

    /// Returns true if the given event flag is set in game memory.
    pub fn is_flag_set(&self, event_flag: u32) -> bool {
        let (pointer, bits) = self.resolve_flag(event_flag);
        if bits == 0 {
            return false;
        }
        let value = pointer.read_u8_rel(None);
        (value & bits) != 0
    }

    /// Resolve an event flag to its memory pointer and bit mask.
    pub fn resolve_flag(&self, event_flag: u32) -> (Pointer, u8) {
        self.resolve_event_flag(event_flag)
    }
}

// Safe to share across hudhook's render thread: all reads target the local game process.
unsafe impl Send for EventFlagReader {}
unsafe impl Sync for EventFlagReader {}
