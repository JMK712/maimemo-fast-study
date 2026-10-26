$ErrorActionPreference = 'Stop'
$key = 'Software\Google\Chrome\NativeMessagingHosts\com.maimemo.faststudy.wake'
$registry = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($key)
if ($registry) {
  $registry.Close()
  [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKey($key)
  Write-Host 'Removed on-demand local speech wake host registration.'
}
