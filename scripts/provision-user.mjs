import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {
    email: "",
    password: "",
    displayName: ""
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    const next = args[index + 1];

    if (current === "--email") {
      parsed.email = next ?? "";
      index += 1;
    } else if (current === "--password") {
      parsed.password = next ?? "";
      index += 1;
    } else if (current === "--displayName") {
      parsed.displayName = next ?? "";
      index += 1;
    }
  }

  return parsed;
};

const run = async () => {
  const { email, password, displayName } = parseArgs();

  if (!email || !password || !displayName) {
    throw new Error(
      "Usage: npm run provision:user -- --email tech@example.com --password 'SECRET' --displayName 'Max Mustermann'"
    );
  }

  initializeApp();
  const auth = getAuth();
  const db = getFirestore();

  let uid = "";

  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;

    await auth.updateUser(uid, {
      password,
      displayName,
      disabled: false
    });
  } catch (error) {
    const authError = error;
    if (typeof authError === "object" && authError && "code" in authError && authError.code === "auth/user-not-found") {
      const created = await auth.createUser({
        email,
        password,
        displayName,
        emailVerified: true,
        disabled: false
      });
      uid = created.uid;
    } else {
      throw error;
    }
  }

  await db.doc(`users/${uid}`).set(
    {
      role: "technician",
      displayName,
      email,
      active: true,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );

  console.log(`Techniker-Konto bereitgestellt: ${uid} (${email})`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
