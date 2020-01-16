import fs from 'fs';

import express from 'express';
import stringSimilarity from 'string-similarity';
import joi from '@hapi/joi';
import mongoose from 'mongoose';

const PREFIX = 'MY_APP_';
const defaults = {
  address: 'localhost',
  port: 3000,
  database: {
    address: 'localhost',
    port: 27017,
    name: 'dictionary'
  }
};

let content = null;
let configuration = {};
try {
  content = fs.readFileSync('configuration.json')
  configuration = JSON.parse(content);
} catch (ignored) {} 

const get = name => {
  const realName = `${PREFIX}${name.replace('.', '_')}`;

  const splited = name.split('.');
  const processSplited = object => splited.reduce((result, current) => result[current], object);

  return processSplited(configuration) || process.env[realName] || processSplited(defaults);
};

const databaseAddress = `${get('database.address')}:${get('database.port')}/${get('database.name')}`;

mongoose
  .connect(`mongodb://${databaseAddress}`, { useNewUrlParser: true, useUnifiedTopology: true })
  .catch(() => console.error(`Failed to connect to database at '${databaseAddress}'`));

const database = mongoose.connection;
database.once('open', () => {
  const dictionary = {
    knight: 'a man in armor',
    knife: 'a piece of metal',
    knee: 'ur knee'
  }
  
  const validate = (object, fields) => {
    const schema = {
      name: joi.string().min(2).max(30),
      description: joi.string().min(3).max(200)
    };
  
    fields.filter(field => schema[field]).forEach(field => schema[field].required());
  
    return joi.object(schema).validate(object);
  };
  
  const app = express()
    .use(express.json());
  
  app.get('/api/word/:name', (request, response) => {
    const validation = validate(request.params, ['name']);
    if (validation.error) {
      return response.status(400).send(validation.error.details[0].message);
    }
  
    const result = dictionary[request.params.name];
  
    if (!result) {
      return response.status(404).send(`word '${request.params.name}' not found`)
    }
  
    response.send({
      name: request.params.name,
      description: result
    });
  });
  
  app.post('/api/word', (request, response) => {
    const validation = validate(request.body, ['name', 'description']);
    if (validation.error) {
      return response.status(400).send(validation.error.details[0].message);
    }
  
    if (dictionary[request.body.name]) {
      return response.status(409).send(`word '${request.body.name}' already exist`);
    }
  
    dictionary[request.body.name] = request.body.description;
  
    response.status(201).send({
      name: request.body.name,
      description: dictionary[request.body.name]
    });
  });
  
  app.put('/api/word/:name', (request, response) => {
    const validation = validate(request.body, ['name', 'description']);
    if (validation.error) {
      return response.status(400).send(validation.error.details[0].message);
    }
  
    response.send({
      name: request.body.name,
      description: dictionary[request.body.name]
    });
  });
  
  app.get('/api/word', (request, response) => {
    const validation = validate(request.query, ['name']);
    if (validation.error) {
      return response.status(400).send(validation.error.details[0].message);
    }
  
    const result = stringSimilarity.findBestMatch(request.query.name, Object.keys(dictionary));
  
    response.send(result.bestMatch);
  });
  
  app.delete('/api/word/:name', (request, response) => {
    const validation = validate(request.params, ['name']);
    if (validation.error) {
      return response.status(400).send(validation.error.details[0].message);
    }
  
    if (dictionary[request.params.name]) {
      return response.status(404).send(`word '${request.params.name}' not found`);
    }
  
    delete dictionary[request.params.name];
  
    response.send();
  });
  
  const listener = app.listen(get('port'), get('address'), () => {
    console.info(
      `Server listening on http://${listener.address().address}:${listener.address().port}`
    );
  });
});
