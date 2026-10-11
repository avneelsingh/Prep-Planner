import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
    getFirestore,
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDA-YDzWiVgBOhaRAQLPc4sGu2W0aaMdrE",
    authDomain: "prep-planner.firebaseapp.com",
    projectId: "prep-planner",
    storageBucket: "prep-planner.firebasestorage.app",
    messagingSenderId: "435211150258",
    appId: "1:435211150258:web:30e7b075f99cb31ec13aab"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

let currentUser = null;
let saveQueue = Promise.resolve();

const DEFAULT_DATA = {
    subjects: [],
    xp: 0
};

const copyDefaultData = () => structuredClone(DEFAULT_DATA);

const userDocument = (uid) => doc(db, "users", uid);

const localKey = (uid) => `prepPlannerData_v12_${uid}`;

function setStatus(message) {
    const el = document.getElementById("auth-status");
    if (el) el.textContent = message;
}

function showLogin() {
    document.getElementById("login-view").classList.remove("hidden");
    document.getElementById("app-view").classList.add("hidden");
}

function showApp() {
    document.getElementById("login-view").classList.add("hidden");
    document.getElementById("app-view").classList.remove("hidden");
}

function renderUser(user) {
    const area = document.getElementById("user-auth-area");
    area.replaceChildren();

    const wrapper = document.createElement("div");
    wrapper.className = "flex items-center gap-3 px-2 w-full";

    const avatar = document.createElement("img");
    avatar.className = "w-10 h-10 rounded-full border-2 border-blue-100 shadow-sm";
    avatar.alt = "Profile picture";
    avatar.src = user.photoURL || "";

    const details = document.createElement("div");
    details.className = "flex flex-col flex-1 overflow-hidden";

    const name = document.createElement("span");
    name.className = "text-sm font-bold text-white truncate";
    name.textContent = user.displayName || user.email || "User";

    const email = document.createElement("span");
    email.className = "text-xs text-slate-400 truncate";
    email.textContent = user.email || "";

    const logout = document.createElement("button");
    logout.className = "text-xs font-bold text-red-400 text-left hover:underline w-max";
    logout.textContent = "Log Out";
    logout.addEventListener("click", window.logoutUser);

    details.append(name, email, logout);
    wrapper.append(avatar, details);
    area.append(wrapper);
}

// Load cloud data before opening the dashboard.
async function loadUserData(user) {
    const snapshot = await getDoc(userDocument(user.uid));

    if (snapshot.exists()) {
        const cloudData = snapshot.data();

        if (
            !cloudData ||
            !Array.isArray(cloudData.subjects) ||
            typeof cloudData.xp !== "number"
        ) {
            throw new Error("Your saved data has an unexpected format.");
        }

        return cloudData;
    }

    // Do not automatically import a shared, unscoped local cache.
    // A new account starts with a clean dataset.
    const initialData = copyDefaultData();

    await setDoc(userDocument(user.uid), initialData);

    return initialData;
}

// Called by app.js whenever the user changes learning data.
window.saveUserData = function (updatedData) {
    if (!currentUser) {
        console.error("Save skipped: no authenticated user.");
        return Promise.reject(new Error("You are not signed in."));
    }

    const uid = currentUser.uid;
    const snapshot = structuredClone(updatedData);

    // Keep writes in order so an older save cannot overwrite a newer one.
    saveQueue = saveQueue
        .catch(() => {
            // Allow later saves to retry after a previous failure.
        })
        .then(async () => {
            if (!currentUser || currentUser.uid !== uid) {
                throw new Error("Account changed before saving.");
            }

            localStorage.setItem(localKey(uid), JSON.stringify(snapshot));

            await setDoc(userDocument(uid), snapshot);
        });

    return saveQueue.catch((error) => {
        console.error("Failed to save PrepPlanner data:", error);

        if (currentUser && currentUser.uid === uid && window.app) {
            window.app.showToast(
                "Cloud save failed. Check your connection and Firebase rules.",
                "error"
            );
        }

        throw error;
    });
};

window.loginWithGoogle = async function () {
    setStatus("Opening sign-in window...");

    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Google sign-in failed:", error);
        setStatus("Sign-in failed: " + error.message);
    }
};

window.logoutUser = async function () {
    try {
        await signOut(auth);
        // Keep the user's own local cache; do not delete cloud data.
    } catch (error) {
        console.error("Logout failed:", error);

        if (window.app) {
            window.app.showToast("Unable to log out.", "error");
        }
    }
};

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        currentUser = null;

        // Reset in-memory state when no account is signed in.
        data = copyDefaultData();

        document.getElementById("user-auth-area").replaceChildren();
        showLogin();
        setStatus("");
        return;
    }

    currentUser = user;
    showLogin();
    setStatus("Loading your cloud data...");

    try {
        const loadedData = await loadUserData(user);

        // Do not apply an old account's result if the session changed.
        if (!currentUser || currentUser.uid !== user.uid) return;

        data = loadedData;
        localStorage.setItem(localKey(user.uid), JSON.stringify(data));

        renderUser(user);
        showApp();
        setStatus("");

        app.init();
    } catch (error) {
        console.error("Could not load PrepPlanner data:", error);

        // Fail closed rather than showing another account's data.
        currentUser = null;
        await signOut(auth).catch(() => {});

        showLogin();
        setStatus(
            "Could not load your data. Check Firebase setup and Firestore rules, then sign in again."
        );
    }
});
