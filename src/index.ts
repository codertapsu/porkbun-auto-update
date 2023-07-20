import 'dotenv/config';

import http from 'https';
import axios, { AxiosError } from 'axios';

import { CronJob } from 'cron';
import winston from 'winston';

export interface DnsRecords {
  status: string;
  cloudflare: string;
  records: Record[];
}

export interface Record {
  id: string;
  name: string;
  type: RecordType;
  content: string;
  ttl: string;
  prio: null | string;
  notes: null | string;
}

export enum RecordType {
  Address = 'A',
  NameServer = 'NS',
  Text = 'TXT',
}

const secretApiKey = process.env.SecretKey!;
const apiKey = process.env.APIKey!;
const domain = process.env.Domain!;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'MMM-DD-YYYY HH:mm:ss' }),
    winston.format.align(),
    winston.format.printf(info => `${[info.timestamp]}: ${info.message}`),
  ),
  transports: [new winston.transports.File({ filename: 'logs/combined.log' })],
});
// https://www.ipify.org/

// const options = {
//   host: 'api.ipify.org',
//   port: 80,
//   path: '/',
// };

// http.get(`https://api.ipify.org?format=json`, resp => {
//   resp.on('data', ip => {
//     console.log('My public IP address is: ' + ip);
//   });
// });

const getCurrentPublicIp = async () => {
  const response = await axios.get<{ ip: string }>(`https://api.ipify.org?format=json`);
  return response.data?.ip;
};

const originEndpoint = `https://porkbun.com/api/json/v3`;

const pingToPorkbun = async () => {
  const response = await axios.post<{ status: string; yourIp: string }>(`${originEndpoint}/ping`, {
    secretapikey: secretApiKey,
    apikey: apiKey,
  });
  return response.data?.yourIp;
};

const retrieveDNSRecordsByDomain = async (domain: string) => {
  const response = await axios.post<DnsRecords>(`${originEndpoint}/dns/retrieve/${domain}`, {
    secretapikey: secretApiKey,
    apikey: apiKey,
  });
  return (response.data?.records || []).filter(record => record.type === RecordType.Address.valueOf());
};

const updateAddressDNSRecordsByDomain = (domain: string, newAddress: string) => async (record: Record) => {
  let name = (record.name || '').replace(domain, '').trim();
  if (name.endsWith('.')) {
    name = name.replace(/.$/, '');
  }
  const response = await axios.post<{ status: string }>(`${originEndpoint}/dns/edit/${domain}/${record.id}`, {
    name,
    secretapikey: secretApiKey,
    apikey: apiKey,
    type: record.type,
    content: newAddress,
    ttl: record.ttl,
  });
  return response.data;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let currentPublicIp = '';
const run = async () => {
  const newPublicIp = await getCurrentPublicIp();
  if (newPublicIp === currentPublicIp) {
    logger.info(`Public IP was not changed.`);
    return;
  }
  currentPublicIp = newPublicIp;
  const dnsRecords = await retrieveDNSRecordsByDomain(domain);
  const updater = updateAddressDNSRecordsByDomain(domain, currentPublicIp);
  for (let index = 0, length = dnsRecords.length; index < length; index++) {
    const record = dnsRecords[index];
    if (record.content !== currentPublicIp) {
      try {
        const result = await updater(record);
        logger.info(`Updated ${record.name} to ${currentPublicIp}: ${result?.status}`);
        await sleep(3000);
      } catch (error) {
        if (error instanceof AxiosError) {
          logger.info(`Failed to update ${record.name}`);
        } else {
          logger.error((error as any)?.message || 'Unknown error');
        }
      }
    } else {
      logger.info(`Nothing changes ${record.name} to ${currentPublicIp}`);
    }
  }
};

const onTick = () => {
  run()
    .then(() => {
      // logger.error(error?.message || 'Unknown error');
    })
    .catch(error => {
      logger.error(error?.message || 'Unknown error');
    });
};
const onComplete = () => {};
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const startNow = false;
const runOnInit = true;
const job = new CronJob('0 */30 * * * *', onTick, onComplete, startNow, timeZone, null, runOnInit);
job.start();
