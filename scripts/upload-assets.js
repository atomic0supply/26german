/**
 * Script para subir la plantilla PDF y los logos de empresas a Firebase Storage.
 *
 * Uso:
 *   node scripts/upload-assets.js
 *
 * Requiere:
 *   - GOOGLE_APPLICATION_CREDENTIALS apuntando a una service account key
 *   - O estar autenticado con `firebase login` y usar el emulador
 *
 * Para el emulador local:
 *   FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 node scripts/upload-assets.js
 */

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getStorage }                    = require("firebase-admin/storage");
const fs   = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Configuración — ajusta el nombre del bucket si es necesario
// ---------------------------------------------------------------------------
const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET || undefined; // undefined = bucket por defecto

// ---------------------------------------------------------------------------
// Assets a subir
// ---------------------------------------------------------------------------
const ASSETS = [
  // Plantillas AcroForm — rutas alineadas con templates.ts
  {
    localPath:   path.join(__dirname, "../templates/template-prok15.pdf"),
    storagePath: "template/template-prok15.pdf",
    contentType: "application/pdf"
  },
  {
    localPath:   path.join(__dirname, "../templates/template-all15.pdf"),
    storagePath: "template/template-all15.pdf",
    contentType: "application/pdf"
  },
  {
    localPath:   path.join(__dirname, "../templates/template-LECKORTUNG.pdf"),
    storagePath: "template/template-LECKORTUNG.pdf",
    contentType: "application/pdf"
  },
  // Logos de empresas — rutas alineadas con COMPANIES en templates.ts
  {
    localPath:   path.join(__dirname, "../companies/SVT/logo_svt.png"),
    storagePath: "logo/logo_svt.png",
    contentType: "image/png"
  },
  {
    localPath:   path.join(__dirname, "../companies/brasa/brasa_logo.jpg"),
    storagePath: "logo/brasa_logo.jpg",
    contentType: "image/jpeg"
  },
  {
    localPath:   path.join(__dirname, "../companies/Angerhausen/logo_angerhausen.png"),
    storagePath: "logo/logo_angerhausen.png",
    contentType: "image/png"
  },
  {
    localPath:   path.join(__dirname, "../companies/AquaRADAR/logo_aquaradar.jpg"),
    storagePath: "logo/logo_aquaradar.jpg",
    contentType: "image/jpeg"
  },
  {
    localPath:   path.join(__dirname, "../companies/Hermann SBR/logo_herrmann.png"),
    storagePath: "logo/logo_herrmann.png",
    contentType: "image/png"
  },
  {
    localPath:   path.join(__dirname, "../companies/homekoncept/logo_homekoncept.png"),
    storagePath: "logo/logo_homekoncept.png",
    contentType: "image/png"
  },
  {
    localPath:   path.join(__dirname, "../companies/wasa-t/Ilogo_wasatec.png"),
    storagePath: "logo/Ilogo_wasatec.png",
    contentType: "image/png"
  }
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (getApps().length === 0) {
    initializeApp({ storageBucket: BUCKET_NAME });
  }

  const storage = getStorage();
  const bucket  = BUCKET_NAME ? storage.bucket(BUCKET_NAME) : storage.bucket();

  console.log(`Bucket: ${bucket.name}\n`);

  for (const asset of ASSETS) {
    if (!fs.existsSync(asset.localPath)) {
      console.warn(`⚠  No encontrado: ${asset.localPath}`);
      continue;
    }

    const bytes = fs.readFileSync(asset.localPath);
    const file  = bucket.file(asset.storagePath);

    await file.save(bytes, {
      contentType: asset.contentType,
      metadata: { cacheControl: "public, max-age=31536000" }
    });

    console.log(`✓  ${asset.storagePath}  (${(bytes.length / 1024).toFixed(1)} KB)`);
  }

  console.log("\n✅ Todos los assets subidos correctamente.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
