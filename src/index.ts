import 'dotenv/config';

import http from 'https';
import axios, { AxiosError } from 'axios';

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
  console.log({
    name,
    type: record.type,
    content: newAddress,
    ttl: record.ttl,
  });

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

const run = async () => {
  const currentPublicIp = await getCurrentPublicIp();
  console.log(currentPublicIp);
  const dnsRecords = await retrieveDNSRecordsByDomain(domain);
  const updater = updateAddressDNSRecordsByDomain(domain, currentPublicIp);
  for (let index = 0, length = dnsRecords.length; index < length; index++) {
    const record = dnsRecords[index];
    if (record.content !== currentPublicIp) {
      try {
        const result = await updater(record);
        console.log(`Updated ${record.name} to ${currentPublicIp}: ${result?.status}`);
        await sleep(3000);
      } catch (error) {
        if (error instanceof AxiosError) {
          console.log(`Failed to update ${record.name}`);
          console.log({
            code: error.code,
            data: error.response?.data,
          });
        } else {
          console.log(error);
        }
      }
    } else {
      console.log(`Nothing changes ${record.name} to ${currentPublicIp}`);
    }
  }
};

run()
  .then(() => {
    console.log(`Porkbun was updated.`);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
