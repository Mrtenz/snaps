import type { CryptographicFunctions } from '@metamask/key-tree';
import { BIP44CoinTypeNode } from '@metamask/key-tree';
import type {
  PermissionSpecificationBuilder,
  PermissionValidatorConstraint,
  RestrictedMethodOptions,
  ValidPermissionSpecification,
} from '@metamask/permission-controller';
import { PermissionType, SubjectType } from '@metamask/permission-controller';
import { rpcErrors } from '@metamask/rpc-errors';
import type {
  GetBip44EntropyParams,
  GetBip44EntropyResult,
} from '@metamask/snaps-sdk';
import { SnapCaveatType } from '@metamask/snaps-utils';
import type { NonEmptyArray } from '@metamask/utils';

import type { MethodHooksObject } from '../utils';
import { getValueFromEntropySource } from '../utils';

const targetName = 'snap_getBip44Entropy';

export type GetBip44EntropyMethodHooks = {
  /**
   * Get the mnemonic seed of the provided source. If no source is provided, the
   * mnemonic seed of the primary keyring will be returned.
   *
   * @param source - The optional ID of the source to get the mnemonic of.
   * @returns The mnemonic seed of the provided source, or the default source if no
   * source is provided.
   */
  getMnemonicSeed: (source?: string | undefined) => Promise<Uint8Array>;

  /**
   * Waits for the extension to be unlocked.
   *
   * @returns A promise that resolves once the extension is unlocked.
   */
  getUnlockPromise: (shouldShowUnlockRequest: boolean) => Promise<void>;

  /**
   * Get the cryptographic functions to use for the client. This may return an
   * empty object or `undefined` to fall back to the default cryptographic
   * functions.
   *
   * @returns The cryptographic functions to use for the client.
   */
  getClientCryptography: () => CryptographicFunctions | undefined;
};

type GetBip44EntropySpecificationBuilderOptions = {
  methodHooks: GetBip44EntropyMethodHooks;
};

type GetBip44EntropySpecification = ValidPermissionSpecification<{
  permissionType: PermissionType.RestrictedMethod;
  targetName: typeof targetName;
  methodImplementation: ReturnType<typeof getBip44EntropyImplementation>;
  allowedCaveats: Readonly<NonEmptyArray<string>> | null;
  validator: PermissionValidatorConstraint;
}>;

/**
 * The specification builder for the `snap_getBip44Entropy` permission.
 * `snap_getBip44Entropy_*` lets the Snap control private keys for a particular
 * BIP-32 coin type.
 *
 * @param options - The specification builder options.
 * @param options.methodHooks - The RPC method hooks needed by the method
 * implementation.
 * @returns The specification for the `snap_getBip44Entropy` permission.
 */
const specificationBuilder: PermissionSpecificationBuilder<
  PermissionType.RestrictedMethod,
  GetBip44EntropySpecificationBuilderOptions,
  GetBip44EntropySpecification
> = ({ methodHooks }: GetBip44EntropySpecificationBuilderOptions) => {
  return {
    permissionType: PermissionType.RestrictedMethod,
    targetName,
    allowedCaveats: [SnapCaveatType.PermittedCoinTypes],
    methodImplementation: getBip44EntropyImplementation(methodHooks),
    validator: ({ caveats }) => {
      if (
        caveats?.length !== 1 ||
        caveats[0].type !== SnapCaveatType.PermittedCoinTypes
      ) {
        throw rpcErrors.invalidParams({
          message: `Expected a single "${SnapCaveatType.PermittedCoinTypes}" caveat.`,
        });
      }
    },
    subjectTypes: [SubjectType.Snap],
  };
};

const methodHooks: MethodHooksObject<GetBip44EntropyMethodHooks> = {
  getMnemonicSeed: true,
  getUnlockPromise: true,
  getClientCryptography: true,
};

export const getBip44EntropyBuilder = Object.freeze({
  targetName,
  specificationBuilder,
  methodHooks,
} as const);

/**
 * Builds the method implementation for `snap_getBip44Entropy`.
 *
 * @param hooks - The RPC method hooks.
 * @param hooks.getMnemonicSeed - A function to retrieve the BIP-39 seed
 * of the user.
 * @param hooks.getUnlockPromise - A function that resolves once the MetaMask
 * extension is unlocked and prompts the user to unlock their MetaMask if it is
 * locked.
 * @param hooks.getClientCryptography - A function to retrieve the cryptographic
 * functions to use for the client.
 * @returns The method implementation which returns a `BIP44CoinTypeNode`.
 * @throws If the params are invalid.
 */
export function getBip44EntropyImplementation({
  getMnemonicSeed,
  getUnlockPromise,
  getClientCryptography,
}: GetBip44EntropyMethodHooks) {
  return async function getBip44Entropy(
    args: RestrictedMethodOptions<GetBip44EntropyParams>,
  ): Promise<GetBip44EntropyResult> {
    await getUnlockPromise(true);

    // `args.params` is validated by the decorator, so it's safe to assert here.
    const params = args.params as GetBip44EntropyParams;
    const seed = await getValueFromEntropySource(
      getMnemonicSeed,
      params.source,
    );

    const node = await BIP44CoinTypeNode.fromSeed(
      {
        derivationPath: [seed, `bip32:44'`, `bip32:${params.coinType}'`],
        network: 'mainnet',
      },
      getClientCryptography(),
    );

    return node.toJSON();
  };
}
