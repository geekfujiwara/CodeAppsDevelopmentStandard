"""Check publishedon after PvaPublish"""
import sys, os
_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "power-platform-standard"))
from dotenv import load_dotenv
from auth_helper import api_get
load_dotenv()

BOT_ID = os.getenv("BOT_ID", "")
bot = api_get(f"bots({BOT_ID})?$select=publishedon")
print(f"publishedon: {bot.get('publishedon')}")
