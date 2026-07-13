

import random
from dataclasses import dataclass, field
from typing import List, Optional, Dict
from card_data import Card, load_cards

WEAKNESS_BONUS = 20
RESISTANCE_REDUCTION = 30
PRIZES_TO_WIN = 6
MAX_TURNS = 60


@dataclass
class InPlayPokemon:
    card: Card
    damage: int = 0
    attached_energy: List[str] = field(default_factory=list)

    @property
    def current_hp(self) -> int:
        return (self.card.hp or 0) - self.damage

    @property
    def is_knocked_out(self) -> bool:
        return self.current_hp <= 0

    def can_pay(self, cost: str) -> bool:
        pool = list(self.attached_energy)
        needs_colorless = 0
        needed: Dict[str, int] = {}
        for ch in cost:
            if ch == "C":
                needs_colorless += 1
            else:
                needed[ch] = needed.get(ch, 0) + 1
        for etype, n in needed.items():
            have = pool.count(etype)
            if have < n:
                return False
            for _ in range(n):
                pool.remove(etype)
        return len(pool) >= needs_colorless


TYPE_ENERGY_LETTER = {
    "Fire": "F", "Water": "W", "Lightning": "L", "Grass": "G",
    "Fighting": "F", "Psychic": "P", "Steel": "M", "Dragon": "C", "Colorless": "C",
}


@dataclass
class Player:
    name: str
    deck: List[Card]
    hand: List[Card] = field(default_factory=list)
    discard: List[Card] = field(default_factory=list)
    prizes: List[Card] = field(default_factory=list)
    active: Optional[InPlayPokemon] = None
    bench: List[InPlayPokemon] = field(default_factory=list)
    energy_attached_this_turn: bool = False
    retreated_this_turn: bool = False

    def draw(self, n=1):
        for _ in range(n):
            if self.deck:
                self.hand.append(self.deck.pop())

    def all_in_play(self) -> List[InPlayPokemon]:
        return ([self.active] if self.active else []) + self.bench

    def has_lost(self) -> bool:
        no_pokemon = self.active is None and not self.bench
        deck_out = len(self.deck) == 0
        return no_pokemon or (len(self.prizes) == 0)


def setup_player(name: str, decklist: Dict[str, int], cards: Dict[str, Card], rng: random.Random) -> Player:
    deck: List[Card] = []
    for cid, count in decklist.items():
        deck.extend([cards[cid]] * count)
    rng.shuffle(deck)
    p = Player(name=name, deck=deck)
    
    for _ in range(200):
        p.hand = [p.deck.pop() for _ in range(min(7, len(p.deck)))]
        if any(c.is_pokemon and c.is_basic for c in p.hand):
            break
        p.deck.extend(p.hand)
        p.hand = []
        rng.shuffle(p.deck)
      
  basics_in_hand = [c for c in p.hand if c.is_pokemon and c.is_basic]
    first = basics_in_hand[0]
    p.hand.remove(first)
    p.active = InPlayPokemon(card=first)
    for c in list(p.hand):
        if c.is_pokemon and c.is_basic and len(p.bench) < 5:
            p.hand.remove(c)
            p.bench.append(InPlayPokemon(card=c))
    
    p.prizes = [p.deck.pop() for _ in range(min(PRIZES_TO_WIN, len(p.deck)))]
    return p


class Battle:
    def __init__(self, deck_a, deck_b, cards, agent_a, agent_b, seed=None):
        self.rng = random.Random(seed)
        self.cards = cards
        self.players = [
            setup_player("A", deck_a, cards, self.rng),
            setup_player("B", deck_b, cards, self.rng),
        ]
        self.agents = [agent_a, agent_b]
        self.turn_count = 0

    def opponent(self, i):
        return self.players[1 - i]

    def legal_actions(self, i) -> List[dict]:
        p = self.players[i]
        actions = [{"type": "pass"}]
        if p.active is None and p.bench:
            actions.append({"type": "promote", "index": 0})
            return actions
          
        if not p.energy_attached_this_turn:
            for idx, c in enumerate(p.hand):
                if c.category == "Energy":
                    actions.append({"type": "attach_energy", "hand_index": idx, "target": "active"})
                    for b_i in range(len(p.bench)):
                        actions.append({"type": "attach_energy", "hand_index": idx, "target": f"bench{b_i}"})
                    break

      
        if not p.retreated_this_turn and p.active and p.bench:
            cost = p.active.card.retreat or 0
            if len(p.active.attached_energy) >= cost:
                for b_i in range(len(p.bench)):
                    actions.append({"type": "retreat", "bench_index": b_i})

        if p.active:
            for a_idx, atk in enumerate(p.active.card.attacks):
                if p.active.can_pay(atk.cost):
                    actions.append({"type": "attack", "attack_index": a_idx})

      
        for idx, c in enumerate(p.hand):
            if c.category == "Trainer" and c.name in ("Potion", "Switch", "Professor's Research"):
                actions.append({"type": "play_trainer", "hand_index": idx, "name": c.name})

        return actions

    def apply_action(self, i, action):
        p = self.players[i]
        opp = self.opponent(i)
        if action["type"] == "pass":
            return
        if action["type"] == "promote":
            p.active = p.bench.pop(action["index"])
            return
        if action["type"] == "attach_energy":
            c = p.hand.pop(action["hand_index"])
            letter = TYPE_ENERGY_LETTER.get(c.name.replace(" Energy", ""), "C")
            target = p.active if action["target"] == "active" else p.bench[int(action["target"][5:])]
            target.attached_energy.append(letter)
            p.energy_attached_this_turn = True
            return
        if action["type"] == "retreat":
            cost = p.active.card.retreat or 0
            for _ in range(cost):
                if p.active.attached_energy:
                    p.active.attached_energy.pop()
            p.bench.append(p.active)
            p.active = p.bench.pop(action["bench_index"])
            p.retreated_this_turn = True
            return
        if action["type"] == "attack":
            atk = p.active.card.attacks[action["attack_index"]]
            dmg = atk.damage
            target = opp.active
            if target.card.weakness == p.active.card.ptype:
                dmg += WEAKNESS_BONUS
            if target.card.resistance == p.active.card.ptype:
                dmg = max(0, dmg - RESISTANCE_REDUCTION)
            target.damage += dmg
            if target.is_knocked_out:
                opp.discard.append(target.card)
                opp.active = None
                if opp.prizes:
                    p.hand.append(opp.prizes.pop())
                if opp.bench:
                  
                    pass
            return
        if action["type"] == "play_trainer":
            c = p.hand.pop(action["hand_index"])
            p.discard.append(c)
            if c.name == "Potion" and p.active:
                p.active.damage = max(0, p.active.damage - 30)
            elif c.name == "Switch" and p.bench:
                p.bench.append(p.active)
                p.active = p.bench.pop(0)
            elif c.name == "Professor's Research":
                p.discard.extend(p.hand)
                p.hand = []
                p.draw(7)
            return

    def is_over(self) -> Optional[int]:
        """Return winner index (0 or 1), or None if not over."""
        for i, p in enumerate(self.players):
            opp = self.opponent(i)
            if len(opp.prizes) == 0:
                return i
            if opp.active is None and not opp.bench:
                return i
            if len(opp.deck) == 0 and self.turn_count > 0:
              
                pass
        return None

    def run(self, verbose=False) -> int:
        turn_player = 0
        while self.turn_count < MAX_TURNS:
            p = self.players[turn_player]
            opp = self.opponent(turn_player)
            p.energy_attached_this_turn = False
            p.retreated_this_turn = False

            if len(p.deck) == 0:
                return 1 - turn_player

            p.draw(1)

            if p.active is None:
                if p.bench:
                    p.active = p.bench.pop(0)
                else:
                    return 1 - turn_player

          
            for _ in range(20):
                actions = self.legal_actions(turn_player)
                obs = self.build_observation(turn_player)
                action = self.agents[turn_player].choose_action(obs, actions)
                self.apply_action(turn_player, action)
                winner = self.is_over()
                if winner is not None:
                    return winner
                if action["type"] in ("attack", "pass"):
                    break

            self.turn_count += 1
            turn_player = 1 - turn_player
        return -1

    def build_observation(self, i) -> dict:
        p, opp = self.players[i], self.opponent(i)
        def pk(x):
            return None if x is None else {
                "name": x.card.name, "hp": x.current_hp, "max_hp": x.card.hp,
                "type": x.card.ptype, "energy": list(x.attached_energy),
                "attacks": [(a.name, a.cost, a.damage) for a in x.card.attacks],
                "weakness": x.card.weakness, "resistance": x.card.resistance,
            }
        return {
            "my_active": pk(p.active),
            "my_bench": [pk(b) for b in p.bench],
            "my_hand": [c.name for c in p.hand],
            "my_prizes_left": len(p.prizes),
            "opp_active": pk(opp.active),
            "opp_bench": [pk(b) for b in opp.bench],
            "opp_prizes_left": len(opp.prizes),
        }
