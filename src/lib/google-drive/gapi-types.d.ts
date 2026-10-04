/**
 * Hand-written ambient types for exactly the parts of Google's `gapi` /
 * Google Identity Services / Picker global objects this app uses — narrower
 * than pulling in @types/gapi or @types/google.picker as dependencies for a
 * handful of calls.
 */

interface GoogleTokenResponse {
  access_token?: string;
  /** Lifetime in seconds. Google sends it as a number or a numeric string. */
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

/** Non-OAuth failures (popup blocked, popup closed) arrive here, NOT in `callback`. */
interface GoogleTokenClientError {
  type: "popup_failed_to_open" | "popup_closed" | "unknown" | string;
  message?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GooglePickerDocument {
  id: string;
  name: string;
  mimeType?: string;
}

interface GooglePickerResponse {
  action: string;
  docs?: GooglePickerDocument[];
}

interface GooglePickerDocsView {
  setIncludeFolders: (include: boolean) => GooglePickerDocsView;
  setSelectFolderEnabled: (enabled: boolean) => GooglePickerDocsView;
  setMimeTypes: (mimeTypes: string) => GooglePickerDocsView;
}

interface GooglePickerBuilder {
  addView: (view: GooglePickerDocsView) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setAppId: (appId: string) => GooglePickerBuilder;
  setCallback: (cb: (response: GooglePickerResponse) => void) => GooglePickerBuilder;
  setTitle: (title: string) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
}

interface Window {
  gapi: {
    load: (
      moduleName: string,
      options: { callback: () => void; onerror?: () => void },
    ) => void;
  };
  google: {
    accounts: {
      oauth2: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          /** 'none' = never show a sign-in or consent screen. */
          prompt?: string;
          callback: (response: GoogleTokenResponse) => void;
          error_callback?: (error: GoogleTokenClientError) => void;
        }) => GoogleTokenClient;
      };
    };
    picker: {
      PickerBuilder: new () => GooglePickerBuilder;
      DocsView: new (viewId?: unknown) => GooglePickerDocsView;
      ViewId: { FOLDERS: unknown };
      Action: { PICKED: string; CANCEL: string };
    };
  };
}
