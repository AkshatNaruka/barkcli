# TODO — VS Code Extension Publishing

These steps require manual action and cannot be automated in this session.

---

## 1. Publish to VS Code Marketplace

The extension is built and ready at `vscode-extension/barkcli-vscode-0.1.0.vsix`.

### Prerequisites

1. Create an Azure DevOps organization at https://dev.azure.com
2. Create a Personal Access Token (PAT):
   - Go to User Settings → Personal access tokens → New Token
   - Organization: **All accessible organizations**
   - Scopes: **Custom defined** → Marketplace → **Manage**
3. Create a publisher at https://marketplace.visualstudio.com/manage:
   - Publisher ID: `barkcli`
   - Publisher Name: `barkcli`

### Publish

```bash
cd vscode-extension

# Login (paste PAT when prompted)
vsce login barkcli

# Publish to Marketplace
vsce publish
```

### Verify

- Extension page: https://marketplace.visualstudio.com/items?itemName=barkcli.barkcli-vscode
- Users can then install via VS Code Extensions panel (search "barkcli")

---

## 2. Tag Release & Trigger CI

The release workflow (`.github/workflows/release.yml`) is updated to build and upload the VSIX.

```bash
# Commit all changes
git add -A
git commit -m "feat: add vscode-install command, VSIX build, and init hint"

# Tag the release
git tag v0.2.1

# Push commits and tag
git push origin master --tags
```

This will:
- Build release binaries for all platforms
- Build the VSIX from `vscode-extension/`
- Upload VSIX as a GitHub Release asset
- Mirror VSIX to `barkcli.vercel.app/downloads/`
- Update Homebrew formula

---

## 3. Verify After Release

- Check GitHub Releases: https://github.com/AkshatNaruka/barkcli/releases
- Confirm `barkcli-vscode-0.1.0.vsix` is listed as a release asset
- Test install: `barkcli vscode-install` should download and install successfully
