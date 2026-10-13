import os
import sys

# Ensure module path resolution works in both local and Vercel serverless environments
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from api.index import app
except ImportError:
    from index import app
