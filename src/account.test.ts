import {
  OrganizationsClient,
  DescribeAccountCommand,
} from '@aws-sdk/client-organizations';
import AWS from 'aws-sdk';
import { getAccountAlias } from './account';
import { AWSConfig } from './config';
import { mockClient } from 'aws-sdk-client-mock';
import AWSMock from 'aws-sdk-mock';

jest.mock('./logger', () => ({
  ...jest.requireActual('./logger'),
  showSpinner: jest.fn(),
}));

describe('getAccountAlias', () => {
  const organizationsMock = mockClient(OrganizationsClient);

  beforeEach(() => {
    AWSMock.setSDKInstance(AWS);
    organizationsMock.reset();
  });

  afterEach(() => {
    AWSMock.restore();
    jest.clearAllMocks();
  });

  it('should return account alias when targetAccount is provided', async () => {
    const awsConfig: AWSConfig = {
      credentials: {
        accessKeyId: 'testAccessKeyId',
        secretAccessKey: 'testSecretAccessKey',
        sessionToken: 'testSessionToken',
      },
      region: 'us-east-1',
      targetAccount: '123456789012',
    };

    const describeAccountCommandOutput = {
      Account: {
        Id: '123456789012',
        Name: 'TestAccount',
      },
    };

    organizationsMock
      .on(DescribeAccountCommand)
      .resolves(describeAccountCommandOutput);

    const organizationsClientSpy = jest.spyOn(
      OrganizationsClient.prototype,
      'send',
    );

    const alias = await getAccountAlias(awsConfig);

    expect(alias).toBe('TestAccount');
    expect(organizationsClientSpy).toHaveBeenCalledWith(
      expect.any(DescribeAccountCommand),
    );
    expect(organizationsClientSpy.mock.calls[0][0].input).toEqual({
      AccountId: '123456789012',
    });

    const clientInstance = organizationsClientSpy.mock.instances[0];
    const credentials = await clientInstance.config.credentials();
    expect(credentials.accessKeyId).toEqual('testAccessKeyId');
    expect(credentials.secretAccessKey).toEqual('testSecretAccessKey');
    expect(credentials.sessionToken).toEqual('testSessionToken');
  });

  it('should return targetAccount when account name is not available', async () => {
    const awsConfig: AWSConfig = {
      credentials: {
        accessKeyId: 'testAccessKeyId',
        secretAccessKey: 'testSecretAccessKey',
        sessionToken: 'testSessionToken',
      },
      region: 'us-east-1',
      targetAccount: '123456789012',
    };

    organizationsMock.on(DescribeAccountCommand).resolves({
      Account: {
        Id: '123456789012',
      },
    });

    const alias = await getAccountAlias(awsConfig);
    expect(alias).toBe('123456789012');
  });

  it('should return account alias when targetAccount is not provided', async () => {
    const awsConfig: AWSConfig = {
      credentials: {
        accessKeyId: 'testAccessKeyId',
        secretAccessKey: 'testSecretAccessKey',
        sessionToken: 'testSessionToken',
      },
      region: 'us-east-1',
      targetAccount: '',
    };

    AWSMock.mock('IAM', 'listAccountAliases', async () => {
      return { AccountAliases: ['test-alias'] };
    });

    // confirm that getCallerIdentity() will not be called in this test
    const stsSpy = jest.fn();
    AWSMock.mock('STS', 'getCallerIdentity', stsSpy);

    const alias = await getAccountAlias(awsConfig);
    expect(alias).toBe('test-alias');
    expect(stsSpy).not.toHaveBeenCalled();
  });
});
