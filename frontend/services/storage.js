async function saveCredentials(data) {

  await chrome.storage.local.set({
    grace_credentials: data
  });

}

async function getCredentials() {

  const result =
    await chrome.storage.local.get(
      "grace_credentials"
    );

  return result.grace_credentials;
}