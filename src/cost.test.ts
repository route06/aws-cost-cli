import AWS from 'aws-sdk';
import { AWSConfig } from './config';
import { getRawCostByService, getTotalCosts } from './cost';
import { generateMockedCostByService } from './testUtils';
import AWSMock from 'aws-sdk-mock';
import dayjs from 'dayjs';

// Use Apr 2024 (30 days) as the 'last month'
// Thus 'today' is someday in May 2024
const costDataLength = 65;
const fixedToday = '2024-05-11'; // cost of 'this month' will be sum of 10 days from May 1 to May 10 ('today' is omitted because its cost is incomplete)
const fixedFirstDay = dayjs(fixedToday).subtract(costDataLength, 'day');

jest.mock('./logger', () => ({
  ...jest.requireActual('./logger'),
  showSpinner: jest.fn(),
}));

describe('Cost Functions', () => {
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

  describe('getRawCostByService', () => {
    it('should return raw cost by service', async () => {
      const awsConfig: AWSConfig = {
        credentials: {
          accessKeyId: 'testAccessKeyId',
          secretAccessKey: 'testSecretAccessKey',
          sessionToken: 'testSessionToken',
        },
        region: 'us-east-1',
      };

      const mockedPricingData = generateMockedCostByService(
        fixedToday,
        costDataLength,
      );

      AWSMock.mock('CostExplorer', 'getCostAndUsage', (params, callback) => {
        callback(null, mockedPricingData);
      });

      const rawCostByService = await getRawCostByService(awsConfig);

      const expectedRawCostByService = {
        service1: {},
        service2: {},
      };
      for (let i = 0; i < costDataLength; i++) {
        const date = dayjs(fixedFirstDay).add(i, 'day').format('YYYY-MM-DD');
        const month = dayjs(date).month();
        let service1Cost;

        switch (month) {
          case 2: // March
            service1Cost = 0.9;
            break;
          case 3: // April
            service1Cost = 1.0; // Total cost of service1 in April will be 30.00
            break;
          case 4: // May
            service1Cost = 1.1;
            break;
          default:
            service1Cost = 0.0; // Default cost if none of the above
        }

        expectedRawCostByService.service1[date] = service1Cost;
        expectedRawCostByService.service2[date] = service1Cost * 100;
      }

      expect(rawCostByService).toEqual(expectedRawCostByService);

      AWSMock.restore('CostExplorer');
    });
  });

  describe('getTotalCosts', () => {
    it('should return total costs', async () => {
      const awsConfig: AWSConfig = {
        credentials: {
          accessKeyId: 'testAccessKeyId',
          secretAccessKey: 'testSecretAccessKey',
          sessionToken: 'testSessionToken',
        },
        region: 'us-east-1',
      };

      const mockedPricingData = generateMockedCostByService(
        fixedToday,
        costDataLength,
      );

      AWSMock.mock('CostExplorer', 'getCostAndUsage', (params, callback) => {
        callback(null, mockedPricingData);
      });

      const totalCosts = await getTotalCosts(awsConfig);

      const expectedTotalCosts = {
        totals: {
          lastMonth: 30 * (1 + 100), // Apr
          thisMonth: 10 * (1.1 + 110), // sum of May 1..May 10
          last7Days: 7 * 1.1 + 7 * 110, // sum of May 4..May 10
          yesterday: 1.1 + 110, // on May 10
        },
        totalsByService: {
          lastMonth: {
            // Apr
            service1: 30.0,
            service2: 3000.0,
          },
          thisMonth: {
            service1: 11.0, // 10 days of May
            service2: 1100.0,
          },
          last7Days: {
            service1: 7.7,
            service2: 770.0,
          },
          yesterday: {
            service1: 1.1,
            service2: 110.0,
          },
        },
      };

      console.log(expectedTotalCosts);

      const roundToTwoDecimals = (num: number) => Math.round(num * 100) / 100;

      Object.keys(totalCosts.totals).forEach((key) => {
        expect(roundToTwoDecimals(totalCosts.totals[key])).toBeCloseTo(
          expectedTotalCosts.totals[key],
          1,
        );
      });

      Object.keys(totalCosts.totalsByService).forEach((period) => {
        Object.keys(totalCosts.totalsByService[period]).forEach((service) => {
          expect(
            roundToTwoDecimals(totalCosts.totalsByService[period][service]),
          ).toBeCloseTo(expectedTotalCosts.totalsByService[period][service], 1);
        });
      });

      AWSMock.restore('CostExplorer');
    });
  });
});
