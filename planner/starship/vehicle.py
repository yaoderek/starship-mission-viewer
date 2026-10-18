"""Starship vehicle model. ALL NUMBERS ARE ESTIMATES based on public statements /
press figures, not official SpaceX specifications. Every one is configurable."""
import math
from dataclasses import dataclass
from .constants import G0

@dataclass
class Starship:
    dry_mass_t: float = 120.0        # ESTIMATE (public range ~100-120 t, Block 2/3)
    prop_capacity_t: float = 1600.0  # SpaceX site (V3, 2026): 1,600 t; 2020 user guide era: 1,200 t
    isp_s: float = 375.0             # RVac ~380 s (Wikipedia/SpaceX); 3 SL engines ~350 s -> all-6 blend ~366 s; 375 = middle
    payload_t: float = 100.0         # user payload
    residual_prop_leo_t: float = 50.0  # ESTIMATE prop left in tanks on reaching LEO
    tanker_load_t: float = 100.0     # ESTIMATE prop delivered per tanker flight
    max_fill_fraction: float = 1.0   # max fraction of capacity that may be filled
    refuels: int = 8                 # number of tanker flights

    def prop_after_refuel(self, refuels=None):
        n = self.refuels if refuels is None else refuels
        cap = self.prop_capacity_t * self.max_fill_fraction
        return min(cap, self.residual_prop_leo_t + n * self.tanker_load_t)

    def delta_v(self, refuels=None):
        """Ideal (Tsiolkovsky) delta-v in km/s from LEO with full burn of loaded prop."""
        m_end = self.dry_mass_t + self.payload_t
        m0 = m_end + self.prop_after_refuel(refuels)
        return self.isp_s * G0 * math.log(m0 / m_end)

    def max_delta_v(self):
        return self.delta_v(refuels=10**6)

    def refuels_needed(self, dv_kms):
        """Minimum tanker flights to reach dv_kms, or None if impossible even when full."""
        m_end = self.dry_mass_t + self.payload_t
        prop = m_end * (math.exp(dv_kms / (self.isp_s * G0)) - 1)
        if prop > self.prop_capacity_t * self.max_fill_fraction + 1e-9:
            return None
        need = prop - self.residual_prop_leo_t
        return max(0, math.ceil(need / self.tanker_load_t - 1e-9))

    def prop_needed_t(self, dv_kms):
        m_end = self.dry_mass_t + self.payload_t
        return m_end * (math.exp(dv_kms / (self.isp_s * G0)) - 1)
