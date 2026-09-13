using Nook.Domain.Entities;

namespace Nook.Application.Common;

public interface IPasswordHasher
{
    string Hash(User user, string password);

    /// <summary>Returns <c>null</c> when the password does not match; otherwise whether a rehash is recommended.</summary>
    bool? Verify(User user, string hash, string password);
}
