/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { crashMonitoringTest } from '../../../test/shared/crashMonitoring.test'

// This test is slower so we want to it to run as an integ test for CI
describe('CrashMonitoring', crashMonitoringTest)
