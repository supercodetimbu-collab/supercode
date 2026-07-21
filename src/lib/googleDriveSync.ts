import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request full drive access or drive.file access.
// Since the user is connecting to a specific folder, we requested drive.file in the OAuth flow,
// but we can request both or the specific authorized scope to ensure permission is granted.
provider.addScope('https://www.googleapis.com/auth/drive.file');

const FOLDER_ID = '1tfovDIcwAopsjXPn8Kxb1wWF9u0VXzrU';
const FILE_NAME = 'church_cms_database.json';

let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Initialize auth listener
export const initGoogleDriveAuth = (
  onSuccess: (user: User, token: string) => void,
  onFailure: () => void
) => {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      // Check if we have a cached token.
      const savedToken = sessionStorage.getItem('gdrive_access_token');
      if (savedToken) {
        cachedAccessToken = savedToken;
        onSuccess(user, savedToken);
      } else {
        // If logged in but no token, we might need a popup sign-in to get the access token.
        onFailure();
      }
    } else {
      cachedAccessToken = null;
      sessionStorage.removeItem('gdrive_access_token');
      onFailure();
    }
  });
};

// Sign in to Google and get Access Token
export const signInWithGoogleDrive = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (isSigningIn) return null;
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan token akses dari Google.');
    }
    cachedAccessToken = credential.accessToken;
    sessionStorage.setItem('gdrive_access_token', cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Sign out
export const signOutGoogleDrive = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  sessionStorage.removeItem('gdrive_access_token');
};

// Search for church_cms_database.json inside folder ID
export const findDatabaseFile = async (accessToken: string): Promise<string | null> => {
  try {
    // We search inside the specific folder and check for the exact file name
    const query = encodeURIComponent(`'${FOLDER_ID}' in parents and name = '${FILE_NAME}' and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;
    
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Error finding file on Drive:', errText);
      throw new Error(`Google Drive API error: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  } catch (e) {
    console.error('findDatabaseFile failed:', e);
    return null;
  }
};

// Download database file from Google Drive
export const downloadDatabaseFile = async (accessToken: string, fileId: string): Promise<any> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Error downloading file from Drive:', errText);
    throw new Error(`Gagal mengunduh file database dari Google Drive: ${res.statusText}`);
  }

  return await res.json();
};

// Upload or update database file on Google Drive
export const uploadDatabaseFile = async (
  accessToken: string,
  dbData: any,
  fileId?: string | null
): Promise<string> => {
  if (fileId) {
    // File exists, perform simple media update (PATCH)
    const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dbData),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Error updating file on Drive:', errText);
      throw new Error(`Gagal memperbarui database di Google Drive: ${res.statusText}`);
    }

    return fileId;
  } else {
    // File doesn't exist, perform multipart upload (POST)
    const metadata = {
      name: FILE_NAME,
      parents: [FOLDER_ID],
      mimeType: 'application/json',
    };

    const boundary = 'gdrive_sync_multipart_boundary';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const body =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(dbData) +
      close_delim;

    const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: body,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Error creating file on Drive:', errText);
      throw new Error(`Gagal mengunggah database ke Google Drive: ${res.statusText}`);
    }

    const result = await res.json();
    return result.id;
  }
};
