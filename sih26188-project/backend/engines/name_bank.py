"""
name_bank.py
------------
Curated bank of common Indian first names and surnames with verified
English <-> Devanagari (Hindi) pairs, plus helper functions for
generating controlled ("correct") and noisy ("mismatched") transliterations.
"""

import random
from indic_transliteration import sanscript
from indic_transliteration.sanscript import transliterate

FIRST_NAMES_MALE = [
    ("Rahul", "राहुल"), ("Amit", "अमित"), ("Rajesh", "राजेश"), ("Vijay", "विजय"),
    ("Suresh", "सुरेश"), ("Anil", "अनिल"), ("Sanjay", "संजय"), ("Manoj", "मनोज"),
    ("Deepak", "दीपक"), ("Ravi", "रवि"), ("Ashok", "अशोक"), ("Vikas", "विकास"),
    ("Arjun", "अर्जुन"), ("Karan", "करण"), ("Rohit", "रोहित"), ("Aditya", "आदित्य"),
    ("Mohit", "मोहित"), ("Nitin", "नितिन"), ("Pankaj", "पंकज"), ("Sandeep", "संदीप"),
]

FIRST_NAMES_FEMALE = [
    ("Priya", "प्रिया"), ("Anjali", "अंजली"), ("Neha", "नेहा"), ("Pooja", "पूजा"),
    ("Kavita", "कविता"), ("Sunita", "सुनीता"), ("Meena", "मीना"), ("Rekha", "रेखा"),
    ("Anita", "अनीता"), ("Divya", "दिव्या"), ("Swati", "स्वाति"), ("Shalini", "शालिनी"),
    ("Nisha", "निशा"), ("Kiran", "किरण"), ("Geeta", "गीता"), ("Sarita", "सरिता"),
    ("Aarti", "आरती"), ("Preeti", "प्रीति"), ("Komal", "कोमल"), ("Ritu", "ऋतु"),
]

LAST_NAMES = [
    ("Sharma", "शर्मा"), ("Verma", "वर्मा"), ("Gupta", "गुप्ता"), ("Singh", "सिंह"),
    ("Kumar", "कुमार"), ("Yadav", "यादव"), ("Patel", "पटेल"), ("Reddy", "रेड्डी"),
    ("Nair", "नायर"), ("Iyer", "अय्यर"), ("Mishra", "मिश्रा"), ("Chauhan", "चौहान"),
    ("Jain", "जैन"), ("Agarwal", "अग्रवाल"), ("Pandey", "पांडेय"), ("Das", "दास"),
    ("Ghosh", "घोष"), ("Rao", "राव"), ("Malhotra", "मल्होत्रा"), ("Kapoor", "कपूर"),
]

MIDDLE_TOKENS_EN = ["Kumar", "Kumari", "Nath", "Devi", "Lal", "Prasad"]


def random_person_name(gender: str):
    first_bank = FIRST_NAMES_MALE if gender == "M" else FIRST_NAMES_FEMALE
    first_en, first_hi = random.choice(first_bank)
    last_en, last_hi = random.choice(LAST_NAMES)

    include_middle = random.random() < 0.35
    middle_en = random.choice(MIDDLE_TOKENS_EN) if include_middle else None

    full_en = f"{first_en} {middle_en} {last_en}" if middle_en else f"{first_en} {last_en}"
    full_hi = f"{first_hi} {last_hi}"

    abbrev = f"{first_en[0]}. " + (f"{middle_en[0]}. " if middle_en else "") + last_en

    return {
        "full_en": full_en,
        "full_hi": full_hi,
        "abbrev_en": abbrev,
        "first_en": first_en,
        "last_en": last_en,
    }


def noisy_transliteration(name_en: str) -> str:
    return transliterate(name_en.lower(), sanscript.ITRANS, sanscript.DEVANAGARI)


def swap_similar_name(name_en: str) -> str:
    tokens = name_en.split()
    if random.random() < 0.5:
        new_last_en, _ = random.choice(LAST_NAMES)
        tokens[-1] = new_last_en
    else:
        pool = FIRST_NAMES_MALE + FIRST_NAMES_FEMALE
        new_first_en, _ = random.choice(pool)
        tokens[0] = new_first_en
    return " ".join(tokens)