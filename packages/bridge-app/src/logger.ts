import logger from 'js-logger';
import { isObject, merge } from 'lodash';

export const Logger = (name: string, loggerId: string, indicativeKey?: string) => {
  const consoleHandler = logger.createDefaultHandler();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const errorHandler = async (messages: Array<any>, context) => {
    if (!indicativeKey || context.level.value !== logger.ERROR.value) return;
    const [eventName, ...rest] = messages;
    const objs: Array<object> = rest.filter((_) => isObject(_));
    const properties = merge({ loggerId }, ...objs);

    try {
      await fetch(`https://api.indicative.com/service/event/${indicativeKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventName,
          eventUniqueId: loggerId,
          properties,
        }),
      });
      logger.info('sent error log', {
        eventName,
        eventUniqueId: loggerId,
        properties,
      });
    } catch (e) {
      logger.error('failed sending error log', e.message, e);
    }
  };

  const logLevel = logger['info'.toUpperCase()];
  logger.setLevel(logLevel);

  const logColors = {
    [logger.ERROR.name]: '\x1b[31m%s\x1b[0m',
    [logger.WARN.name]: '\x1b[33m%s\x1b[0m',
    [logger.INFO.name]: '\x1b[36m%s\x1b[0m',
    [logger.DEBUG.name]: '\x1b[32m%s\x1b[0m',
  };

  logger.setHandler((messages, context) => {
    const { name } = context;

    const msgs = Array.from(messages);

    if (name) {
      msgs.unshift({ from: name });
    }
    msgs.unshift(
      logColors[context.level.name],
      `FROM: ${context.name}`,
      `${new Date().toLocaleString()} ${context.level.name}:`,
    );
    consoleHandler(msgs, context);
    errorHandler(msgs, context);
  });

  return logger.get(name);
};
