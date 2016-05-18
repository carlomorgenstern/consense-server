CREATE TABLE `consense`.`Events` (
  `UID` INT NOT NULL,
  `StartDate` DATETIME NULL,
  `EndDate` DATETIME NULL,
  `Location` VARCHAR(200) NULL,
  `Type` VARCHAR(200) NULL,
  `EventName` VARCHAR(200) NULL,
  `EventGroup` VARCHAR(200) NULL,
  `Comment` VARCHAR(200) NULL,
  `Speaker` VARCHAR(200) NULL,
  PRIMARY KEY (`UID`));