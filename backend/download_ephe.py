import os
import urllib.request
import certifi

EPHE_URLS = [
    "https://raw.githubusercontent.com/aloistr/swisseph/master/ephe/seas_18.se1",
    "https://raw.githubusercontent.com/aloistr/swisseph/master/ephe/semo_18.se1",
    "https://raw.githubusercontent.com/aloistr/swisseph/master/ephe/sepl_18.se1"
]

dest_dir = os.path.join(os.path.dirname(__file__), "app", "ephe")
os.makedirs(dest_dir, exist_ok=True)

print("Downloading ephemeris files...")
for url in EPHE_URLS:
    filename = url.split("/")[-1]
    dest_path = os.path.join(dest_dir, filename)
    if not os.path.exists(dest_path):
        print(f"Downloading {filename}...")
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            context = urllib.request.ssl.create_default_context(cafile=certifi.where())
            with urllib.request.urlopen(req, context=context) as response, open(dest_path, 'wb') as out_file:
                out_file.write(response.read())
            print(f"Saved {filename}")
        except Exception as e:
            print(f"Failed to download {filename}: {e}")
    else:
        print(f"{filename} already exists.")
print("Done!")
