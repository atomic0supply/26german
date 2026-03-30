import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { DEFAULT_TEMPLATES } from "./templates";

initializeApp();

const run = async () => {
  const db = getFirestore();

  await Promise.all(
    Object.values(DEFAULT_TEMPLATES).map((template) =>
      db.doc(`templates/${template.id}`).set(template, {
        merge: true
      })
    )
  );

  console.log(`Seeded ${Object.keys(DEFAULT_TEMPLATES).length} templates.`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
