"""Check publishedon after PvaPublish"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from dotenv import load_dotenv
from auth_helper import api_get
load_dotenv()

BOT_ID = os.getenv("BOT_ID", "")
bot = api_get(f"bots({BOT_ID})?$select=publishedon")
print(f"publishedon: {bot.get('publishedon')}")
