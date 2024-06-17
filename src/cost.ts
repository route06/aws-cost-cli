import AWS from 'aws-sdk';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter.js';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
import { AWSConfig } from './config';
import { showSpinner } from './logger';

export type RawCostByService = {
  [key: string]: {
    [date: string]: number;
  };
};

export async function getRawCostByService(
  awsConfig: AWSConfig,
): Promise<RawCostByService> {
  showSpinner('Getting pricing data');

  const costExplorer = new AWS.CostExplorer(awsConfig);
  const endDate = dayjs(); // `endDate` is set to 'today' but its cost be omitted because of API spec (see: https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_GetCostAndUsage.html#API_GetCostAndUsage_RequestSyntax)
  const startDate = endDate.subtract(65, 'day');

  const groupByConfig = [
    {
      Type: 'DIMENSION',
      Key: 'SERVICE',
    },
  ];

  let filterConfig = {
    Not: {
      Dimensions: {
        Key: 'RECORD_TYPE',
        Values: ['Credit', 'Refund', 'Upfront', 'Support'],
      },
    },
  };

  if (awsConfig.targetAccount) {
    groupByConfig.push({
      Type: 'DIMENSION',
      Key: 'LINKED_ACCOUNT',
    });

    filterConfig = {
      And: [
        {
          Dimensions: {
            Key: 'LINKED_ACCOUNT',
            Values: [awsConfig.targetAccount],
          },
        },
        filterConfig,
      ],
    };
  }

  // Get the cost and usage data for the specified account
  const pricingData = await costExplorer
    .getCostAndUsage({
      TimePeriod: {
        Start: startDate.format('YYYY-MM-DD'),
        End: endDate.format('YYYY-MM-DD'),
      },
      Granularity: 'DAILY',
      Filter: filterConfig,
      Metrics: ['UnblendedCost'],
      GroupBy: groupByConfig,
    })
    .promise();

  const costByService = {};

  for (const day of pricingData.ResultsByTime) {
    for (const group of day.Groups) {
      const filterKeys = group.Keys;
      const serviceName = filterKeys.find((key) => !/^\d{12}$/.test(key)); // AWS service name is non-12-digits string
      const cost = group.Metrics.UnblendedCost.Amount;
      const costDate = day.TimePeriod.Start; // must be set to `Start` not `End` because the end of `Period` parameter will be omitted (see: https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_GetCostAndUsage.html#API_GetCostAndUsage_RequestSyntax)

      costByService[serviceName] = costByService[serviceName] || {};
      costByService[serviceName][costDate] = parseFloat(cost);
    }
  }

  return costByService;
}

export type TotalCosts = {
  totals: {
    lastMonth: number;
    thisMonth: number;
    last7Days: number;
    yesterday: number;
  };
  totalsByService: {
    lastMonth: { [key: string]: number };
    thisMonth: { [key: string]: number };
    last7Days: { [key: string]: number };
    yesterday: { [key: string]: number };
  };
};

function calculateServiceTotals(
  rawCostByService: RawCostByService,
): TotalCosts {
  const totals = {
    lastMonth: 0,
    thisMonth: 0,
    last7Days: 0,
    yesterday: 0,
  };

  const totalsByService = {
    lastMonth: {},
    thisMonth: {},
    last7Days: {},
    yesterday: {},
  };

  const startOfLastMonth = dayjs().subtract(1, 'month').startOf('month');
  const startOfThisMonth = dayjs().startOf('month');
  const startOfLast7Days = dayjs().subtract(7, 'day').startOf('day');
  const startOfYesterday = dayjs().subtract(1, 'day').startOf('day');

  for (const service of Object.keys(rawCostByService)) {
    const servicePrices = rawCostByService[service];

    let lastMonthServiceTotal = 0;
    let thisMonthServiceTotal = 0;
    let last7DaysServiceTotal = 0;
    let yesterdayServiceTotal = 0;

    for (const date of Object.keys(servicePrices)) {
      const price = servicePrices[date];
      const dateObj = dayjs(date);

      if (dateObj.isSame(startOfLastMonth, 'month')) {
        lastMonthServiceTotal += price;
      }

      if (dateObj.isSame(startOfThisMonth, 'month')) {
        thisMonthServiceTotal += price;
      }

      if (
        dateObj.isSameOrAfter(startOfLast7Days) &&
        dateObj.isSameOrBefore(dayjs().startOf('day'))
      ) {
        last7DaysServiceTotal += price;
      }

      if (dateObj.isSame(startOfYesterday, 'day')) {
        yesterdayServiceTotal += price;
      }
    }

    totalsByService.lastMonth[service] = lastMonthServiceTotal;
    totalsByService.thisMonth[service] = thisMonthServiceTotal;
    totalsByService.last7Days[service] = last7DaysServiceTotal;
    totalsByService.yesterday[service] = yesterdayServiceTotal;

    totals.lastMonth += lastMonthServiceTotal;
    totals.thisMonth += thisMonthServiceTotal;
    totals.last7Days += last7DaysServiceTotal;
    totals.yesterday += yesterdayServiceTotal;
  }

  return {
    totals,
    totalsByService,
  };
}

export async function getTotalCosts(awsConfig: AWSConfig): Promise<TotalCosts> {
  const rawCosts = await getRawCostByService(awsConfig);
  const totals = calculateServiceTotals(rawCosts);

  return totals;
}

if (process.env.NODE_ENV === 'test') {
  Object.assign(module.exports, {
    calculateServiceTotals,
  });
}
