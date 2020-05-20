# Default Region

The Toolkit requires a region to be selected in order to make a connection to AWS (e.g. to list services in the AWS Explorer). The Toolkit requires metadata
 about regions/service endpoints in order to function - this data is usually referred to as `endpoints.json`. The Toolkit ships with the most recent version of the `endpoints.json` with every release and periodically resolves updates via from a hosted file [`endpoints.json`](https://idetoolkits.amazonwebservices.com/endpoints.json).
 
The Toolkit attempts to determine a default region based on a heuristic, the region ID must exist in the `endpoints.json` metadata to be considered valid. If a region ID resolved by one step in the heuristic does not exist in the metadata, the Toolkit will continue down the list until a valid region is found.

1. **Last selected (by Project)** - if this *Project* has previously been opened with the Toolkit - the last region selected when the toolkit closed will be preseved.
2. **Environment variable / system property** - uses the AWS Java SDK [`SystemSettingsRegionProvider`](https://github.com/aws/aws-sdk-java-v2/blob/master/core/regions/src/main/java/software/amazon/awssdk/regions/providers/SystemSettingsRegionProvider.java) Region Provider to determine region based on the `AWS_REGION` environment variable or `aws.region` system property.
3. **Default Profile** - uses the AWS Java SDK [`AwsProfileRegionProvider`](https://github.com/aws/aws-sdk-java-v2/blob/master/core/regions/src/main/java/software/amazon/awssdk/regions/providers/AwsProfileRegionProvider.java) Region Provider to interrogate the `default` profile (from `~/.aws/credentials` / `~/.aws/config`), using `region` if found in the profile. An example `~/.aws/config`:

  ```
  [default]
  region = us-west-2
  ```

4. **us-east-1** - looks for `us-east-1` in resolved metadata.
5. **First region in metadata** - if all else fails look for the first region that exists in the `endpoints.json` file.

If none of these result in a valid region, an exception will be raised.