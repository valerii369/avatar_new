import os
from PIL import Image

def compress_images():
    directory = 'public/archetypes'
    
    if not os.path.exists(directory):
        print(f"Directory {directory} not found")
        return
        
    for filename in os.listdir(directory):
        if filename.endswith(".png"):
            filepath = os.path.join(directory, filename)
            
            try:
                img = Image.open(filepath)
                
                # Convert to RGB if needed (required for JPEG, though WebP supports RGBA)
                if img.mode in ('RGBA', 'LA'):
                    # if we want to keep transparency we can keep RGBA, 
                    # but usually WebP RGBA is fine
                    pass
                
                # Resize if larger than 800px on longest side
                max_size = 800
                width, height = img.size
                if width > max_size or height > max_size:
                    if width > height:
                        new_width = max_size
                        new_height = int(height * (max_size / width))
                    else:
                        new_height = max_size
                        new_width = int(width * (max_size / height))
                    img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                
                # Save as WebP
                webp_filename = filename.replace('.png', '.webp')
                webp_path = os.path.join(directory, webp_filename)
                
                img.save(webp_path, 'WEBP', quality=85)
                
                # Remove original huge PNG
                os.remove(filepath)
                print(f"Compressed {filename} -> {webp_filename}")
                
            except Exception as e:
                print(f"Error compressing {filename}: {e}")

if __name__ == '__main__':
    compress_images()
