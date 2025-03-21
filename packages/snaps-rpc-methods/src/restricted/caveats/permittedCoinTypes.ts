import type {
  PermissionConstraint,
  RestrictedMethodCaveatSpecificationConstraint,
  Caveat,
} from '@metamask/permission-controller';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type { GetBip44EntropyParams } from '@metamask/snaps-sdk';
import { FORBIDDEN_COIN_TYPES, SnapCaveatType } from '@metamask/snaps-utils';
import type { Json } from '@metamask/utils';
import { hasProperty, isPlainObject } from '@metamask/utils';

/**
 * Map a raw value from the `initialPermissions` to a caveat specification.
 * Note that this function does not do any validation, that's handled by the
 * PermissionsController when the permission is requested.
 *
 * @param value - The raw value from the `initialPermissions`.
 * @returns The caveat specification.
 */
export function permittedCoinTypesCaveatMapper(
  value: Json,
): Pick<PermissionConstraint, 'caveats'> {
  return {
    caveats: [
      {
        type: SnapCaveatType.PermittedCoinTypes,
        value,
      },
    ],
  };
}

/**
 * Validate the params for `snap_getBip44Entropy`.
 *
 * @param value - The params to validate.
 * @throws If the params are invalid.
 */
export function validateBIP44Params(
  value: unknown,
): asserts value is GetBip44EntropyParams {
  if (!isPlainObject(value) || !hasProperty(value, 'coinType')) {
    throw rpcErrors.invalidParams({
      message: 'Expected a plain object containing a coin type.',
    });
  }

  if (
    typeof value.coinType !== 'number' ||
    !Number.isInteger(value.coinType) ||
    value.coinType < 0 ||
    value.coinType > 0x7fffffff
  ) {
    throw rpcErrors.invalidParams({
      message:
        'Invalid "coinType" parameter. Coin type must be a non-negative integer.',
    });
  }

  if (
    hasProperty(value, 'source') &&
    typeof value.source !== 'undefined' &&
    typeof value.source !== 'string'
  ) {
    throw rpcErrors.invalidParams({
      message:
        'Invalid "source" parameter. Source must be a string if provided.',
    });
  }

  if (FORBIDDEN_COIN_TYPES.includes(value.coinType)) {
    throw rpcErrors.invalidParams({
      message: `Coin type ${value.coinType} is forbidden.`,
    });
  }
}

/**
 * Validate the coin types values associated with a caveat. This checks if the
 * values are non-negative integers (>= 0).
 *
 * @param caveat - The caveat to validate.
 * @throws If the caveat is invalid.
 */
export function validateBIP44Caveat(caveat: Caveat<string, any>) {
  if (
    !hasProperty(caveat, 'value') ||
    !Array.isArray(caveat.value) ||
    caveat.value.length === 0
  ) {
    throw rpcErrors.invalidParams({
      message: 'Expected non-empty array of coin types.',
    });
  }

  caveat.value.forEach(validateBIP44Params);
}

export const PermittedCoinTypesCaveatSpecification: Record<
  SnapCaveatType.PermittedCoinTypes,
  RestrictedMethodCaveatSpecificationConstraint
> = {
  [SnapCaveatType.PermittedCoinTypes]: Object.freeze({
    type: SnapCaveatType.PermittedCoinTypes,
    decorator: (method, caveat) => {
      return async (args) => {
        const { params } = args;
        validateBIP44Params(params);

        const coinType = (caveat.value as GetBip44EntropyParams[]).find(
          (caveatValue) => caveatValue.coinType === params.coinType,
        );

        if (!coinType) {
          throw providerErrors.unauthorized({
            message:
              'The requested coin type is not permitted. Allowed coin types must be specified in the snap manifest.',
          });
        }

        return await method(args);
      };
    },
    validator: (caveat) => validateBIP44Caveat(caveat),
  }),
};
