#!/bin/sh
# Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

while [ ! -f /proc/pid/$2 ] ;
do
      sleep 2
done
