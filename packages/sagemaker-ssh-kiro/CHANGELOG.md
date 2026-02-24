## 0.2.0

- Added support for setting the http_proxy and https_proxy environment variables on the remote Kiro server, configurable via the `aws.sagemaker.ssh.kiro.httpProxy` and `aws.sagemaker.ssh.kiro.httpsProxy` settings

## 0.1.1

- Fixed issue where remote connection could fail to a freshly-started Space due to the remote Kiro server not being given enough time to boot
- Fixed issue where attempting to establish a remote connection would hang for a few additional minutes in some cases where the connection had already failed
- Fixed issue where Kiro would infinitely try to reconnect to the Space after a successful remote connection closed unexpectedly

## 0.1.0
- Initial release
