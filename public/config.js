// Site configuration. This is the only file you need to edit to connect the Google Sheet.
//
// In Google Sheets: File > Share > Publish to web > pick ONE tab > "Comma-separated values (.csv)" > Publish.
// Copy the link it gives you and paste it below. Repeat for each tab.
// Leave a value as "" to use the built-in defaults in the /content folder instead.
window.SITE_CONFIG = {
  archiveBase: "https://archive.cfru.ca/show/name/Sound%20So%20Nice/",
  sheets: {
    settings: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS1cKlXpEtpLqQQZZoQ8H5L8Mz7nQeG7LpuLt5u63nN3A5vKObdsy7g6F-gZL339Gt9C4FF-UYBhnN_/pub?gid=1029401766&single=true&output=csv", // Settings tab CSV link
    social: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS1cKlXpEtpLqQQZZoQ8H5L8Mz7nQeG7LpuLt5u63nN3A5vKObdsy7g6F-gZL339Gt9C4FF-UYBhnN_/pub?gid=262371222&single=true&output=csv",   // Social tab CSV link
    playlist: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS1cKlXpEtpLqQQZZoQ8H5L8Mz7nQeG7LpuLt5u63nN3A5vKObdsy7g6F-gZL339Gt9C4FF-UYBhnN_/pub?gid=847887617&single=true&output=csv"  // Playlist tab CSV link
  }
};
