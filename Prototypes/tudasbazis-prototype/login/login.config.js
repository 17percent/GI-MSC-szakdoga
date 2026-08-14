/* login.config.js — OAuth kliens-konfiguráció PLACEHOLDER-ekkel.
 *
 * A kézirat (átadó, 6. pont) szerint: titkot ide SOHA ne írj; a valódi értékek
 * build-időből / environmentből jönnek. Ez a prototípus KÖNYVTÁR NÉLKÜLI és
 * BACKEND NÉLKÜLI (lásd NOTES.md), ezért itt nincs valódi MSAL/GIS redirect —
 * a `loginView` a `startRedirect()` helyén egy MOCK sikeres belépést játszik le.
 * A valódi integráció helye jól láthatóan megjelölve a loginView.js-ben.
 *
 * Klasszikus script (nincs ES-module a prototípusban) → globálisra teszünk.
 */
(function (global) {
  'use strict';

  global.TALTOS_AUTH = {
    // Valódi OAuth-átirányítás konfigurációja (most nincs bekötve — placeholder).
    google: {
      clientId: '<GOOGLE_CLIENT_ID>',
      redirectUri: '<APP_ORIGIN>/auth/callback'
    },
    microsoft: {
      clientId: '<ENTRA_APP_CLIENT_ID>',
      tenantId: '<ENTRA_TENANT_ID>',
      redirectUri: '<APP_ORIGIN>/auth/callback'
    },

    // Emberi címke a providerhez (a „Kapcsolódás …" felirathoz és a gombokhoz).
    labels: {
      google: 'Google',
      microsoft: 'Microsoft'
    },

    /* PROTOTÍPUS-mock: mindkét provider a seed allowlist első engedélyezett
     * identitására lép be (a döntés: „pure to handoff" — a loginon nincs
     * identitásválasztó és nincs 403-demó; a több-userességet az app fejlécében
     * lévő felhasználóváltó fedi). A valódi flow-ban ezt az OIDC-token adná. */
    mockUserId: 'u1'
  };
})(window);
