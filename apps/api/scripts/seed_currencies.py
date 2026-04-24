"""Idempotent seed script: insert common ISO 4217 currencies.

Usage (from apps/api/):
    python scripts/seed_currencies.py
"""

import asyncio
import sys
from pathlib import Path

# Ensure project root is on the path so `app` can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.currency import Currency

# fmt: off
ISO_CURRENCIES: list[tuple[str, str]] = [
    ("AED", "UAE Dirham"),
    ("ARS", "Argentine Peso"),
    ("AUD", "Australian Dollar"),
    ("BRL", "Brazilian Real"),
    ("CAD", "Canadian Dollar"),
    ("CHF", "Swiss Franc"),
    ("CLP", "Chilean Peso"),
    ("CNY", "Chinese Yuan Renminbi"),
    ("COP", "Colombian Peso"),
    ("CZK", "Czech Koruna"),
    ("DKK", "Danish Krone"),
    ("EUR", "Euro"),
    ("GBP", "British Pound Sterling"),
    ("HKD", "Hong Kong Dollar"),
    ("HNL", "Honduran Lempira"),
    ("HUF", "Hungarian Forint"),
    ("IDR", "Indonesian Rupiah"),
    ("ILS", "Israeli New Shekel"),
    ("INR", "Indian Rupee"),
    ("JPY", "Japanese Yen"),
    ("KRW", "South Korean Won"),
    ("MXN", "Mexican Peso"),
    ("MYR", "Malaysian Ringgit"),
    ("NOK", "Norwegian Krone"),
    ("NZD", "New Zealand Dollar"),
    ("PEN", "Peruvian Sol"),
    ("PHP", "Philippine Peso"),
    ("PLN", "Polish Zloty"),
    ("RON", "Romanian Leu"),
    ("RUB", "Russian Ruble"),
    ("SAR", "Saudi Riyal"),
    ("SEK", "Swedish Krona"),
    ("SGD", "Singapore Dollar"),
    ("THB", "Thai Baht"),
    ("TRY", "Turkish Lira"),
    ("TWD", "New Taiwan Dollar"),
    ("UAH", "Ukrainian Hryvnia"),
    ("USD", "US Dollar"),
    ("VND", "Vietnamese Dong"),
    ("ZAR", "South African Rand"),
]
# fmt: on


async def seed(session: AsyncSession) -> None:
    existing_codes: set[str] = set(
        (await session.scalars(select(Currency.code))).all()
    )
    new_currencies = [
        Currency(code=code, name=name)
        for code, name in ISO_CURRENCIES
        if code not in existing_codes
    ]
    if new_currencies:
        session.add_all(new_currencies)
        await session.commit()
        print(f"Inserted {len(new_currencies)} currencies.")
    else:
        print("All currencies already present – nothing to do.")


async def main() -> None:
    engine = create_async_engine(settings.database_url)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    async with session_maker() as session:
        await seed(session)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
