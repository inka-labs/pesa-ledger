"""The product's name and where it lives, in one place. frontend/src/brand.ts mirrors it.

Its own folder and port keep it apart from Ecoscope Studio (8765), Docling Studio (8766) and
DocuFlow (8767) on the same computer.
"""

NAME = "Pesa Ledger"
SLUG = "pesa-ledger"  # folders, service names
HOME_DIR = ".pesa-ledger"  # in the user's home folder; PESA_LEDGER_HOME overrides it
HOME_ENV = "PESA_LEDGER_HOME"
PORT_ENV = "PESA_LEDGER_PORT"
PORT = 8768
BUNDLE_ID = "app.pesaledger.desktop"
