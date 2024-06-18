import AWS from 'aws-sdk';
import { AWSConfig } from './config';
import { formatServiceBreakdown } from './slack';
import { generateMockedCostByService } from '../testUtils';
import { getTotalCosts } from '../cost';
import AWSMock from 'aws-sdk-mock';

const costDataLength = 65;
const fixedToday = '2024-05-11'; // cost of 'this month' will be sum of 10 days from May 1 to May 10 ('today' is omitted because its cost is incomplete)

const awsConfig: AWSConfig = {
  credentials: {
    accessKeyId: 'testAccessKeyId',
    secretAccessKey: 'testSecretAccessKey',
    sessionToken: 'testSessionToken',
  },
  region: 'us-east-1',
};

jest.mock('../logger', () => ({
  ...jest.requireActual('../logger'),
  showSpinner: jest.fn(),
}));

const mockedCostByService = generateMockedCostByService(
  fixedToday,
  costDataLength,
);

beforeAll(() => {
  AWSMock.setSDKInstance(AWS);
});

afterAll(() => {
  AWSMock.restore();
});

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date(fixedToday).getTime());
});

afterEach(() => {
  jest.useRealTimers();
});

AWSMock.mock('CostExplorer', 'getCostAndUsage', (params, callback) => {
  callback(null, mockedCostByService);
});

describe('formatServiceBreakdown', () => {
  it('should return service breakdown of "yesterday"', async () => {
    const totalCosts = await getTotalCosts(awsConfig);
    const result = formatServiceBreakdown(totalCosts, 'yesterday');

    // cost value is defined in generateMockedCostByService
    expect(result).toEqual('> service2: `$110.00`\n' + '> service1: `$1.10`');
  });

  it('should return service breakdown of "Last 7 days"', async () => {
    const totalCosts = await getTotalCosts(awsConfig);
    const result = formatServiceBreakdown(totalCosts, 'last7Days');

    // cost value is defined in generateMockedCostByService
    expect(result).toEqual('> service2: `$770.00`\n' + '> service1: `$7.70`');
  });

  it('should return service breakdown of "This Month"', async () => {
    const totalCosts = await getTotalCosts(awsConfig);
    const result = formatServiceBreakdown(totalCosts, 'thisMonth');

    // cost value is defined in generateMockedCostByService
    expect(result).toEqual('> service2: `$1100.00`\n' + '> service1: `$11.00`');
  });

  it('should return service breakdown of "Last Month"', async () => {
    const totalCosts = await getTotalCosts(awsConfig);
    const result = formatServiceBreakdown(totalCosts, 'lastMonth');

    // cost value is defined in generateMockedCostByService
    expect(result).toEqual('> service2: `$3000.00`\n' + '> service1: `$30.00`');
  });
});
