// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.connection;

import javax.swing.JPanel;
import software.aws.toolkits.jetbrains.ui.CredentialProviderSelector;
import software.aws.toolkits.jetbrains.ui.RegionSelector;

public final class AwsConnectionSettings {
    JPanel panel;
    CredentialProviderSelector credentialProvider;
    RegionSelector region;
}
