"""
------------
Loads card metadata from the competition-provided CSV schema:
Card ID, Card Name, Expansion, Collection No., Stage, Category,
Previous Stage, HP, Type, Weakness, Resistance, Retreat, Rule
(+ attack sub-fields, which are NOT part of the official schema shown
in the competition Data tab, but are required to actually simulate
battles. They're modeled here as an extension so the loader is a strict
superset of the real schema -- drop the real CSV in and only the
attack columns would need to be sourced separately, e.g. via card text
parsing or a supplementary lookup, once you have the real files.)
"""

import csv
from dataclasses import dataclass, field
from typing import Optional, List, Dict


@dataclass
class Attack:
    name: str
    cost: str
    damage: int

    def cost_dict(self) -> Dict[str, int]:
        d: Dict[str, int] = {}
        for ch in self.cost:
            d[ch] = d.get(ch, 0) + 1
        return d

    def energy_count(self) -> int:
        return len(self.cost)


@dataclass
class Card:
    card_id: str
    name: str
    expansion: str
    collection_no: str
    stage: str
    category: str
    previous_stage: Optional[str]
    hp: Optional[int]
    ptype: Optional[str]
    weakness: Optional[str]
    resistance: Optional[str]
    retreat: Optional[int]
    rule_text: str
    attacks: List[Attack] = field(default_factory=list)

    @property
    def is_pokemon(self) -> bool:
        return self.category == "Pokemon"

    @property
    def is_basic(self) -> bool:
        return self.stage == "Basic"


def _to_int(v: str) -> Optional[int]:
    v = (v or "").strip()
    return int(v) if v else None


def load_cards(csv_path: str) -> Dict[str, Card]:
    cards: Dict[str, Card] = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            attacks = []
            for i in (1, 2):
                name = row.get(f"Attack{i}_Name", "").strip()
                if name:
                    attacks.append(Attack(
                        name=name,
                        cost=row.get(f"Attack{i}_Cost", "").strip(),
                        damage=_to_int(row.get(f"Attack{i}_Damage", "0")) or 0,
                    ))
            card = Card(
                card_id=row["Card ID"].strip(),
                name=row["Card Name"].strip(),
                expansion=row.get("Expansion", "").strip(),
                collection_no=row.get("Collection No.", "").strip(),
                stage=row.get("Stage", "").strip(),
                category=row.get("Category", "").strip(),
                previous_stage=row.get("Previous Stage", "").strip() or None,
                hp=_to_int(row.get("HP", "")),
                ptype=row.get("Type", "").strip() or None,
                weakness=row.get("Weakness", "").strip() or None,
                resistance=row.get("Resistance", "").strip() or None,
                retreat=_to_int(row.get("Retreat", "")),
                rule_text=row.get("Rule", "").strip(),
                attacks=attacks,
            )
            cards[card.card_id] = card
    return cards


if __name__ == "__main__":
    cards = load_cards("data/sample_card_data.csv")
    print(f"Loaded {len(cards)} cards")
    for c in list(cards.values())[:5]:
        print(c)
