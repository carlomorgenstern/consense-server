CREATE TABLE 'consense'.'Events' (
  'UID' INT NOT NULL,
  'StartDate' DATETIME NULL,
  'EndDate' DATETIME NULL,
  'Location' VARCHAR(200) NULL,
  'Type' VARCHAR(200) NULL,
  'EventName' VARCHAR(200) NULL,
  'EventGroup' VARCHAR(200) NULL,
  'Comment' VARCHAR(200) NULL,
  'Speaker' VARCHAR(200) NULL,
  PRIMARY KEY ('UID'));

CREATE TABLE 'consense'.'Course' (
  'UID' INT NOT NULL,
  'Name' VARCHAR(100),
  PRIMARY KEY ('UID'));

CREATE TABLE 'consense'.'Speaker' (
  'UID' INT NOT NULL,
  'Name' VARCHAR(100),
  PRIMARY KEY ('UID'));

CREATE TABLE 'consense'.'Room' (
  'UID' INT NOT NULL,
  'Name' VARCHAR(100),
  PRIMARY KEY ('UID'));

CREATE TABLE 'consense'.'User' (
  'UID' INT NOT NULL,
  'Name' VARCHAR(100),
  //TODO Relation zu Course / Speaker / Room
  PRIMARY KEY ('UID'));

CREATE TABLE 'consense'.'Session' (
  'UID' INT NOT NULL,
  'Name' VARCHAR(100),
  //TODO Relation zu Course / Speaker / Room
  PRIMARY KEY ('UID'));