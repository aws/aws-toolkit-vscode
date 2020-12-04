// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3

import javax.swing.JPanel
import javax.swing.JTextField

class CreateBucketPanel {
    lateinit var bucketName: JTextField
        private set
    lateinit var component: JPanel
        private set
}
